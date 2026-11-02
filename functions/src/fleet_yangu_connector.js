import {getFirestore,FieldValue} from 'firebase-admin/firestore';
import {onCall,HttpsError} from 'firebase-functions/v2/https';
import {defineSecret} from 'firebase-functions/params';
import {identifier,canAccess} from './domain.js';
import {safeId,encryptBridgeToken,decryptBridgeToken,
  fleetVehicleStatus,validateFleetReadiness} from './fleet_yangu_domain.js';

const db=getFirestore(),region='europe-west1',stamp=()=>FieldValue.serverTimestamp();
const encryptionKey=defineSecret('FLEET_YANGU_ENCRYPTION_KEY');
const callable=(handler)=>onCall({region,secrets:[encryptionKey]},async request=>{
  try {return await handler(request);}catch(error){
    if(error instanceof HttpsError)throw error;
    throw new HttpsError('failed-precondition',
      error?.message||'Fleet Yangu connector operation failed');
  }
});
async function owner(request){
  if(!request.auth?.uid)throw new HttpsError('unauthenticated','Sign in to Workspace');
  const org=db.doc('organizations/'+identifier(request.data?.orgId));
  const member=(await org.collection('members').doc(request.auth.uid).get()).data();
  if(member?.role!=='owner')
    throw new HttpsError('permission-denied','Workspace owner access required');
  const [fleet,freight]=await Promise.all(['fleet','freight'].map(id=>org.collection('apps').doc(id).get()));
  if(!canAccess(member,'fleet',fleet.data())&&!canAccess(member,'freight',freight.data()))
    throw new HttpsError('permission-denied','An active Fleet or Freight subscription is required');
  return {org,user:request.auth.uid};
}
// The bridge endpoint can only be configured by the platform's runtime
// environment, never by a tenant or another external API response.
function bridgeBase(){
  let url;try {url=new URL(process.env.FLEET_YANGU_BRIDGE_URL||'');}
  catch{throw new HttpsError('failed-precondition','FLEET_YANGU_BRIDGE_URL is not configured');}
  if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||
      url.hostname==='localhost'||/^\d+\.\d+\.\d+\.\d+$/.test(url.hostname)||
      !url.hostname.includes('.'))
    throw new HttpsError('failed-precondition','Fleet Yangu bridge must use configured HTTPS');
  return url.toString().replace(/\/$/,'');
}
async function remote({sourceOrgId,workspaceOrgId,token,action='vehicles',payload}){
  const response=await fetch(bridgeBase()+'/v1/'+action,{
    method:payload?'POST':'GET',redirect:'error',signal:AbortSignal.timeout(10000),
    headers:{authorization:'Bearer '+token,
      'x-fleet-organisation-id':sourceOrgId,'x-workspace-id':workspaceOrgId,
      accept:'application/json',...(payload?{'content-type':'application/json'}:{})},
    ...(payload?{body:JSON.stringify(payload)}:{})
  });
  if(!response.ok)throw new HttpsError(response.status===403?'permission-denied':'unavailable',
    'Fleet Yangu authorization or service unavailable ('+response.status+')');
  const buffer=await response.text();
  if(buffer.length>300000)throw new HttpsError('resource-exhausted','Fleet Yangu response too large');
  const result=JSON.parse(buffer);
  if(!result||typeof result!=='object')throw new Error('Invalid Fleet Yangu response');
  return result;
}
async function current(org){
  const doc=(await org.collection('logisticsIntegrations').doc('fleetYangu').get()).data();
  if(!doc?.enabled||!doc?.sourceOrgId||!doc?.encryptedToken)
    throw new HttpsError('failed-precondition','Fleet Yangu is not connected');
  return {sourceOrgId:doc.sourceOrgId,
    token:decryptBridgeToken(doc.encryptedToken,encryptionKey.value())};
}
async function snapshot(org,source){
  const result=await remote({sourceOrgId:source.sourceOrgId,workspaceOrgId:org.id,
    token:source.token});
  if(result.organisationId!==source.sourceOrgId||result.workspaceOrgId!==org.id)
    throw new HttpsError('failed-precondition','Fleet Yangu tenant identity mismatch');
  return result;
}
export const logisticsConnectFleetYangu=callable(async request=>{
  const {org,user}=await owner(request);
  const sourceOrgId=safeId(request.data.sourceOrgId);
  const token=String(request.data.token||'');
  const encryptedToken=encryptBridgeToken(token,encryptionKey.value());
  const result=await remote({sourceOrgId,workspaceOrgId:org.id,token});
  if(result.organisationId!==sourceOrgId||result.workspaceOrgId!==org.id||
     !Array.isArray(result.vehicles))
    throw new HttpsError('failed-precondition','Fleet Yangu pairing verification failed');
  await org.collection('logisticsIntegrations').doc('fleetYangu').set({
    provider:'fleet_yangu',sourceOrgId,enabled:true,
    encryptedToken,updatedAt:stamp(),updatedBy:user
  });
  return {connected:true,sourceOrgId,permission:'owner-paired',
    vehiclesAvailable:result.vehicles.length,dispatchAllowed:result.dispatchAllowed===true};
});
export const logisticsDisconnectFleetYangu=callable(async request=>{
  const {org}=await owner(request);
  await org.collection('logisticsIntegrations').doc('fleetYangu').delete();
  // Existing vehicle links are inert until reconnected. The source-side key
  // must be revoked independently in Fleet Yangu for immediate invalidation.
  return {disconnected:true,notice:'Revoke the Workspace key inside Fleet Yangu as well'};
});
export const logisticsFleetYanguStatus=callable(async request=>{
  const {org}=await owner(request);
  const doc=(await org.collection('logisticsIntegrations').doc('fleetYangu').get()).data();
  return {connected:doc?.enabled===true,sourceOrgId:doc?.sourceOrgId||null};
});
export const logisticsFleetYanguVehicles=callable(async request=>{
  const {org}=await owner(request);
  const source=await current(org);
  const [result,links]=await Promise.all([
    snapshot(org,source),org.collection('fleetYanguVehicleLinks').limit(100).get()
  ]);
  const mappings=links.docs.map(doc=>({fleetVehicleId:doc.id,
    workspaceVehicleId:doc.data().workspaceVehicleId}));
  return {connected:true,sourceOrgId:source.sourceOrgId,
    vehicles:fleetVehicleStatus(result,mappings),
    alerts:(result.alerts||[]).slice(0,100).map(e=>({
      vehicleId:String(e.vehicleId||''),severity:String(e.severity||''),
      status:String(e.status||''),type:String(e.type||'')})),
    workOrders:(result.workOrders||[]).slice(0,100).map(e=>({
      vehicleId:String(e.vehicleId||''),title:String(e.title||''),
      status:String(e.status||'')})),
    dispatchAllowed:result.dispatchAllowed===true,sampled:true,
    warning:'Read-only Fleet Yangu snapshots. Hardware connectivity and telemetry freshness must be verified.'};
});
export const logisticsLinkFleetYanguVehicle=callable(async request=>{
  const {org,user}=await owner(request);
  const workspaceVehicleId=safeId(request.data.workspaceVehicleId);
  const fleetVehicleId=safeId(request.data.fleetVehicleId);
  const source=await current(org);
  const state=await snapshot(org,source);
  if(!state.vehicles.some(v=>v.id===fleetVehicleId))
    throw new HttpsError('not-found','Fleet vehicle not available to this authorized organization');
  const vehicle=org.collection('logisticsVehicles').doc(workspaceVehicleId);
  const link=org.collection('fleetYanguVehicleLinks').doc(fleetVehicleId);
  return db.runTransaction(async tx=>{
    const [v,l]=await Promise.all([tx.get(vehicle),tx.get(link)]);
    if(!v.exists)throw new HttpsError('not-found','Workspace vehicle not found');
    if(l.exists&&l.data().workspaceVehicleId!==workspaceVehicleId)
      throw new HttpsError('already-exists','Fleet Yangu vehicle linked to another workspace vehicle');
    if(v.data().fleetYanguVehicleId&&v.data().fleetYanguVehicleId!==fleetVehicleId)
      throw new HttpsError('failed-precondition','Unlink existing mapping before reassignment');
    tx.set(link,{workspaceVehicleId,sourceOrgId:source.sourceOrgId,
      createdBy:user,updatedAt:stamp()});
    tx.update(vehicle,{fleetYanguVehicleId,updatedBy:user,updatedAt:stamp()});
    return {linked:true,workspaceVehicleId,fleetVehicleId};
  });
});
export const logisticsUnlinkFleetYanguVehicle=callable(async request=>{
  const {org,user}=await owner(request);
  const workspaceVehicleId=safeId(request.data.workspaceVehicleId);
  const vehicle=org.collection('logisticsVehicles').doc(workspaceVehicleId);
  return db.runTransaction(async tx=>{
    const existing=await tx.get(vehicle);
    if(!existing.exists)throw new HttpsError('not-found','Workspace vehicle not found');
    const fleetVehicleId=existing.data().fleetYanguVehicleId;
    if(!fleetVehicleId)return {unlinked:true};
    const link=org.collection('fleetYanguVehicleLinks').doc(safeId(fleetVehicleId));
    const linkDoc=await tx.get(link);
    if(linkDoc.exists&&linkDoc.data().workspaceVehicleId===workspaceVehicleId)
      tx.delete(link);
    tx.update(vehicle,{fleetYanguVehicleId:FieldValue.delete(),updatedBy:user,updatedAt:stamp()});
    return {unlinked:true};
  });
});
export const logisticsSendFleetYanguDispatch=callable(async request=>{
  const {org,user}=await owner(request);
  if(request.data.confirm!==true)
    throw new HttpsError('invalid-argument','Explicit dispatch handoff confirmation required');
  const shipmentId=safeId(request.data.shipmentId);
  const source=await current(org);
  const shipment=(await org.collection('logisticsShipments').doc(shipmentId).get()).data();
  if(!shipment||!['booked','picked_up'].includes(shipment.status))
    throw new HttpsError('failed-precondition','A booked or picked-up shipment is required');
  const workspaceVehicleId=safeId(shipment.vehicleId);
  const vehicle=(await org.collection('logisticsVehicles').doc(workspaceVehicleId).get()).data();
  const fleetVehicleId=vehicle?.fleetYanguVehicleId;
  if(!fleetVehicleId)throw new HttpsError('failed-precondition','Link this Workspace vehicle to Fleet Yangu first');
  const [link,state]=await Promise.all([
    org.collection('fleetYanguVehicleLinks').doc(fleetVehicleId).get(),
    snapshot(org,source)
  ]);
  if(link.data()?.workspaceVehicleId!==workspaceVehicleId||
     link.data()?.sourceOrgId!==source.sourceOrgId)
    throw new HttpsError('failed-precondition','Stale vehicle mapping');
  if(state.dispatchAllowed!==true)
    throw new HttpsError('permission-denied','Enable dispatch explicitly in Fleet Yangu pairing');
  const observed=fleetVehicleStatus(state).find(v=>v.fleetVehicleId===fleetVehicleId);
  validateFleetReadiness(observed,state.alerts||[]);
  const reply=await remote({sourceOrgId:source.sourceOrgId,
    workspaceOrgId:org.id,token:source.token,action:'dispatch',payload:{
      dispatchId:shipmentId,vehicleId:fleetVehicleId,shipmentId,
      reference:String(shipment.reference||'').slice(0,80),
      destination:String(shipment.destination||'').slice(0,160),
      weightKg:Number(shipment.weightKg||0)
    }});
  if(reply.accepted!==true||
    !['awaiting_fleet_dispatcher_review','accepted','declined'].includes(reply.status))
    throw new HttpsError('unavailable','Fleet Yangu did not acknowledge dispatch handoff');
  await org.collection('logisticsShipments').doc(shipmentId).update({
    fleetYanguDispatchStatus:reply.status,
    fleetYanguTripId:String(reply.tripId||'').slice(0,80),
    fleetYanguSentBy:user,fleetYanguSentAt:stamp()
  });
  return {accepted:true,duplicate:reply.duplicate===true,tripId:reply.tripId,
    status:reply.status,
    notice:'Fleet Yangu returned its current dispatcher decision; no vehicle control was executed'};
});

export const logisticsFleetYanguDispatchStatus=callable(async request=>{
  const {org}=await owner(request);
  const shipmentId=safeId(request.data.shipmentId);
  const shipment=(await org.collection('logisticsShipments').doc(shipmentId).get()).data();
  if(!shipment?.fleetYanguTripId)
    throw new HttpsError('failed-precondition','No confirmed Fleet Yangu handoff for this shipment');
  const source=await current(org);
  const result=await remote({sourceOrgId:source.sourceOrgId,workspaceOrgId:org.id,
    token:source.token,action:'dispatch-status?dispatchId='+shipmentId});
  if(result.sourceDispatchId!==shipmentId||
     !['awaiting_fleet_dispatcher_review','accepted','declined'].includes(result.status))
    throw new HttpsError('failed-precondition','Unrecognized Fleet Yangu dispatch status');
  await org.collection('logisticsShipments').doc(shipmentId).update({
    fleetYanguDispatchStatus:result.status,fleetYanguLastCheckedAt:stamp()
  });
  return {shipmentId,status:result.status,source:'fleet_yangu',
    reviewedAt:result.reviewedAt||null,notice:'Fleet Yangu dispatch review only; Workspace shipment milestone unchanged'};
});
