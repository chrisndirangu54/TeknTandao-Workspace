import {randomUUID} from 'node:crypto';
import {getFirestore,FieldValue} from 'firebase-admin/firestore';
import {onCall,HttpsError} from 'firebase-functions/v2/https';
import {defineSecret} from 'firebase-functions/params';
import {identifier,canAccess} from './domain.js';
import {latLon,routePlanningInput,assertRoutePlanResponse,
  normalizeTraccarPosition} from './logistics_intelligence_domain.js';

const db=getFirestore(),region='europe-west1',stamp=()=>FieldValue.serverTimestamp();
const optimizerKey=defineSecret('LOGISTICS_OPTIMIZER_KEY');
const traccarToken=defineSecret('TRACCAR_API_TOKEN');
const callable=(fn,secrets=[])=>onCall({region,secrets},async request=>{
  try {return await fn(request);}
  catch(error) {
    if(error instanceof HttpsError)throw error;
    throw new HttpsError('failed-precondition',error?.message||'Logistics integration unavailable');
  }
});
async function authorized(request,{owner=true}={}) {
  if(!request.auth?.uid)throw new HttpsError('unauthenticated','Sign in first');
  const org=db.doc('organizations/'+identifier(request.data?.orgId));
  const member=(await org.collection('members').doc(request.auth.uid).get()).data();
  if(!member||(owner&&member.role!=='owner'))
    throw new HttpsError('permission-denied','Workspace owner access required');
  const [fleet,freight]=await Promise.all(['fleet','freight'].map(app=>org.collection('apps').doc(app).get()));
  if(!canAccess(member,'fleet',fleet.data())&&!canAccess(member,'freight',freight.data()))
    throw new HttpsError('permission-denied','Active Fleet or Freight plan required');
  return {org,uid:request.auth.uid};
}
function configuredHttps(name) {
  const raw=process.env[name]||'';
  let url;
  try {url=new URL(raw);}catch{throw new HttpsError('failed-precondition',name+' not configured');}
  if(url.protocol!=='https:'||url.username||url.password||url.hash||url.search||
      (url.port&&url.port!=='443')||!url.hostname.includes('.')||
      url.hostname==='localhost'||/^\d+\.\d+\.\d+\.\d+$/.test(url.hostname))
    throw new HttpsError('failed-precondition',name+' must be a public HTTPS service');
  return url.toString().replace(/\/$/,'');
}
function deviceNumber(value) {
  const number=Number(value);
  if(!Number.isSafeInteger(number)||number<=0)throw new Error('Valid device ID required');
  return number;
}
function jsonRows(snapshot) {return snapshot.docs.map(doc=>({id:doc.id,...doc.data()}));}

// Owners must supply independently verified geocodes; the UI never guesses them.
export const logisticsSetDestinationCoordinates=callable(async request=>{
  const {org,uid}=await authorized(request);
  const shipmentId=identifier(request.data.shipmentId);
  const {lat,lon}=latLon(request.data.destination,'shipment destination');
  const start=request.data.startMinute??0,end=request.data.endMinute??1440;
  if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||
      start<0||end>1440||end<=start)
    throw new HttpsError('invalid-argument','Delivery window must be within 0-1440 minutes');
  const ref=org.collection('logisticsShipments').doc(shipmentId);
  await db.runTransaction(async tx=>{
    const doc=await tx.get(ref);
    if(!doc.exists)throw new HttpsError('not-found','Shipment not found');
    if(!['draft','booked'].includes(doc.data().status))
      throw new HttpsError('failed-precondition','Coordinates locked after pickup');
    tx.update(ref,{destinationLat:lat,destinationLon:lon,
      deliveryWindowStartMin:start,deliveryWindowEndMin:end,updatedBy:uid,updatedAt:stamp()});
  });
  return {shipmentId,coordinatesVerifiedBy:'workspace_owner',geocodedAutomatically:false};
});

// A server-controlled HTTPS endpoint hosts the private optimizer.
// No customer-supplied URLs or keys can reach this call.
export const logisticsOptimizeRoadRoutes=callable(async request=>{
  const {org,uid}=await authorized(request);
  const origin=latLon(request.data.depot,'depot');
  const [shipmentsSnap,vehiclesSnap]=await Promise.all([
    org.collection('logisticsShipments').limit(150).get(),
    org.collection('logisticsVehicles').limit(100).get()
  ]);
  const candidates=jsonRows(shipmentsSnap).filter(s=>['road','courier'].includes(s.mode)&&!s.dispatchPlanId);
  const vehicles=jsonRows(vehiclesSnap).filter(v=>!v.routePlanId);
  const input=routePlanningInput(candidates,vehicles,origin);
  if(!optimizerKey.value())throw new HttpsError('failed-precondition','Optimization key is not configured');
  const endpoint=configuredHttps('LOGISTICS_OPTIMIZER_URL')+'/v1/optimize';
  let response,result;
  try {
    response=await fetch(endpoint,{method:'POST',
      headers:{'x-logistics-service-key':optimizerKey.value(),'content-type':'application/json'},
      body:JSON.stringify({model:input.model,depot:input.depot,
        vehicles:input.vehicles,stops:input.stops}),
      redirect:'error',signal:AbortSignal.timeout(22000)});
    if(!response.ok)throw new Error('optimizer returned '+response.status);
    result=assertRoutePlanResponse(input,await response.json());
  }catch{
    throw new HttpsError('unavailable','Verified road optimization is unavailable; no synthetic route generated');
  }
  const planRef=org.collection('logisticsRoutePlans').doc(randomUUID());
  const snapshot={
    shipmentIds:input.stops.map(s=>s.id),
    vehicleIds:input.vehicles.map(v=>v.id)
  };
  await planRef.create({routes:result.routes,unassigned:result.unassigned,
    diagnostics:result.diagnostics,snapshot,createdBy:uid,createdAt:stamp(),
    status:'proposal',depot:origin});
  return {planId:planRef.id,status:'proposal',...result,
    warning:'Road travel-time estimates, not verified live traffic; approve explicitly to reserve vehicles.'};
});

export const logisticsApproveRoutePlan=callable(async request=>{
  const {org,uid}=await authorized(request);
  const planId=identifier(request.data.planId);
  if(request.data.confirm!==true)
    throw new HttpsError('invalid-argument','Explicit plan confirmation required');
  const ref=org.collection('logisticsRoutePlans').doc(planId);
  return db.runTransaction(async tx=>{
    const planDoc=await tx.get(ref);
    const plan=planDoc.data();
    if(!plan||plan.status!=='proposal')
      throw new HttpsError('failed-precondition','Unapproved proposal required');
    const routes=plan.routes||[];
    if(!routes.length)throw new HttpsError('failed-precondition','No routable shipments');
    const vehicleIds=routes.map(x=>identifier(x.vehicleId));
    const shipmentIds=routes.flatMap(x=>x.stops.map(y=>identifier(y.shipmentId)));
    if(new Set(vehicleIds).size!==vehicleIds.length ||
       new Set(shipmentIds).size!==shipmentIds.length)
      throw new HttpsError('failed-precondition','Duplicate vehicles or shipments in plan');
    const vehicleRefs=vehicleIds.map(id=>org.collection('logisticsVehicles').doc(id));
    const shipmentRefs=shipmentIds.map(id=>org.collection('logisticsShipments').doc(id));
    const docs=await Promise.all([...vehicleRefs,...shipmentRefs].map(doc=>tx.get(doc)));
    for(let i=0;i<vehicleIds.length;i++) {
      const v=docs[i].data();
      if(!v||v.available!==true||v.routePlanId)
        throw new HttpsError('failed-precondition','Vehicle availability changed; recompute the route');
    }
    for(let i=0;i<shipmentIds.length;i++) {
      const s=docs[vehicleIds.length+i].data();
      if(!s||!['draft','booked'].includes(s.status)||s.dispatchPlanId)
        throw new HttpsError('failed-precondition','Shipment changed; recompute the route');
    }
    routes.forEach((route,i)=>tx.update(vehicleRefs[i],{
      available:false,routePlanId:planId,updatedBy:uid,updatedAt:stamp()}));
    for(const route of routes)for(const stop of route.stops) {
      tx.update(org.collection('logisticsShipments').doc(stop.shipmentId),{
        vehicleId:route.vehicleId,dispatchPlanId:planId,updatedAt:stamp(),updatedBy:uid});
    }
    tx.update(ref,{status:'approved',approvedAt:stamp(),approvedBy:uid});
    return {planId,status:'approved',reservedVehicles:vehicleIds.length,
      reservedShipments:shipmentIds.length,
      warning:'Vehicles reserved; external booking, road departures and driver notifications are not automatically executed'};
  });
});

// Platform-managed GPS registry prevents tenant owners claiming someone else's
// Traccar device ID. Platform admin custom claim must be granted out of band.
export const logisticsProvisionGpsDevice=callable(async request=>{
  if(!request.auth?.uid||request.auth.token?.logisticsAdmin!==true)
    throw new HttpsError('permission-denied','Platform logistics administrator required');
  const orgId=identifier(request.data.orgId);
  const vehicleId=identifier(request.data.vehicleId);
  const deviceId=deviceNumber(request.data.deviceId);
  const consentRecord=String(request.data.consentReference||'').trim();
  if(consentRecord.length<8||consentRecord.length>200)
    throw new HttpsError('invalid-argument','Record the approved vehicle tracking consent reference');
  const org=db.doc('organizations/'+orgId);
  const vehicleRef=org.collection('logisticsVehicles').doc(vehicleId);
  const bindingRef=db.collection('logisticsDeviceBindings').doc(String(deviceId));
  return db.runTransaction(async tx=>{
    const [vehicle,binding]=await Promise.all([tx.get(vehicleRef),tx.get(bindingRef)]);
    if(!vehicle.exists)throw new HttpsError('not-found','Vehicle not registered');
    if(binding.exists && (binding.data().orgId!==orgId||binding.data().vehicleId!==vehicleId))
      throw new HttpsError('already-exists','Traccar device allocated to another vehicle or tenant');
    tx.set(bindingRef,{orgId,vehicleId,consentReference:consentRecord,
      active:true,approvedBy:request.auth.uid,approvedAt:stamp()});
    tx.update(vehicleRef,{traccarDeviceId:deviceId,updatedAt:stamp()});
    return {vehicleId,deviceId,provisioned:true};
  });
});
export const logisticsRevokeGpsDevice=callable(async request=>{
  if(!request.auth?.uid||request.auth.token?.logisticsAdmin!==true)
    throw new HttpsError('permission-denied','Platform logistics administrator required');
  const deviceId=deviceNumber(request.data.deviceId);
  const ref=db.collection('logisticsDeviceBindings').doc(String(deviceId));
  return db.runTransaction(async tx=>{
    const binding=await tx.get(ref);
    if(!binding.exists)return {revoked:true};
    const vehicleRef=db.doc('organizations/'+binding.data().orgId+
      '/logisticsVehicles/'+binding.data().vehicleId);
    const vehicle=await tx.get(vehicleRef);
    tx.delete(ref);
    if(vehicle.exists&&vehicle.data().traccarDeviceId===deviceId)
      tx.update(vehicleRef,{traccarDeviceId:FieldValue.delete(),updatedAt:stamp()});
    return {revoked:true};
  });
});

// Owner-only, on-demand latest GPS snapshot: no history or live stream is exposed.
export const logisticsTraccarSnapshot=callable(async request=>{
  const {org}=await authorized(request);
  if(!traccarToken.value())throw new HttpsError('failed-precondition','Traccar API token is not configured');
  const base=configuredHttps('TRACCAR_BASE_URL');
  const vehicles=jsonRows(await org.collection('logisticsVehicles').limit(100).get())
    .filter(v=>Number.isSafeInteger(v.traccarDeviceId));
  const bindings=await Promise.all(vehicles.map(v=>
    db.collection('logisticsDeviceBindings').doc(String(v.traccarDeviceId)).get()));
  const permitted=new Map();
  vehicles.forEach((v,i)=>{
    const b=bindings[i].data();
    if(b?.active===true&&b.orgId===org.id&&b.vehicleId===v.id)
      permitted.set(v.traccarDeviceId,{id:v.id,registration:v.registration});
  });
  if(!permitted.size)return {positions:[],source:'Traccar',connected:false,
    warning:'No platform-approved Traccar device assignments for this workspace'};
  let raw;
  try {
    const response=await fetch(base+'/api/positions',{
      headers:{Authorization:'Bearer '+traccarToken.value(),Accept:'application/json'},
      redirect:'error',signal:AbortSignal.timeout(12000)});
    if(!response.ok)throw new Error('position lookup failed');
    const body=await response.text();
    if(body.length>3_000_000)throw new Error('position response exceeds limit');
    raw=JSON.parse(body);
    if(!Array.isArray(raw))throw new Error('Unexpected Traccar response');
  }catch {
    throw new HttpsError('unavailable','Traccar is unavailable; last known positions cannot be verified');
  }
  const positions=[];
  for(const entry of raw) {
    const vehicle=permitted.get(entry?.deviceId);
    if(!vehicle)continue;
    try {
      positions.push({...vehicle,deviceId:entry.deviceId,
        ...normalizeTraccarPosition(entry,entry.deviceId)});
    }catch{/* ignore invalid or out-of-date GPS samples */}
  }
  return {positions,source:'Traccar',connected:true,liveStream:false,
    warning:'Latest positions from server on demand. GPS accuracy, latency and driver consent depend on devices and provider.'};
},[traccarToken]);
