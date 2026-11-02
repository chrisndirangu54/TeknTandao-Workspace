import {createHash, randomUUID, randomBytes, timingSafeEqual} from 'node:crypto';
import {getFirestore, FieldValue} from 'firebase-admin/firestore';
import {onCall, onRequest, HttpsError} from 'firebase-functions/v2/https';
import {defineSecret} from 'firebase-functions/params';
import {identifier, canAccess} from './domain.js';
import {carrierDirectory, normalizeCarrier, normalizeShipment,
  normalizeMilestone, transitionShipment, tariffComparison,
  dispatchProposal, trackingFromDhl} from './logistics_domain.js';

const db=getFirestore(),region='europe-west1';
const dhlKey=defineSecret('DHL_UNIFIED_API_KEY');
const stamp=()=>FieldValue.serverTimestamp();
const callable=(handler,secrets=[])=>onCall({region,secrets},async request=>{
  try{return await handler(request);}
  catch(error){
    if(error instanceof HttpsError)throw error;
    throw new HttpsError('failed-precondition',error?.message||'Logistics request failed');
  }
});
async function access(request,{owner=false}={}){
  if(!request.auth?.uid)throw new HttpsError('unauthenticated','Sign in to Workspace');
  const org=db.doc('organizations/'+identifier(request.data?.orgId));
  const user=request.auth.uid;
  const member=(await org.collection('members').doc(user).get()).data();
  if(!member||(owner&&member.role!=='owner'))
    throw new HttpsError('permission-denied','Workspace membership or owner permission required');
  const [fleet,freight]=await Promise.all(['fleet','freight'].map(id=>org.collection('apps').doc(id).get()));
  if(!canAccess(member,'fleet',fleet.data())&&!canAccess(member,'freight',freight.data()))
    throw new HttpsError('permission-denied','An active Fleet or Freight subscription is required');
  return {org,user,member};
}
const plain=doc=>{
  const value=doc.data()||{};
  return {id:doc.id,...Object.fromEntries(Object.entries(value).map(([k,v])=>
    [k,v?.toDate?.() ? v.toDate().toISOString() : v]))};
};
const list=async(collection,limit=100)=>{
  const data=await collection.limit(limit).get();
  return data.docs.map(plain);
};
export const logisticsControlTower=callable(async request=>{
  const {org}=await access(request);
  const [shipments,carriers,vehicles,events]=await Promise.all([
    list(org.collection('logisticsShipments'),150),
    list(org.collection('logisticsCarriers'),100),
    list(org.collection('logisticsVehicles'),100),
    list(org.collection('logisticsMilestones'),100)
  ]);
  const counter=status=>shipments.filter(s=>s.status===status).length;
  const exceptions=shipments.filter(s=>s.status==='exception'||s.status==='customs_hold');
  return {shipments,carriers,vehicles,events:events.sort((a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||''))).slice(0,40),
    kpis:{total:shipments.length,inTransit:counter('in_transit')+counter('out_for_delivery'),
      delivered:counter('delivered'),exceptions:exceptions.length},
    providers:carrierDirectory.map(p=>({...p,connectionStatus:p.id==='dhl'?'requires_api_key':'requires_onboarding'})),
    sampleData:false,limitedTo:150};
});
export const logisticsRegisterCarrier=callable(async request=>{
  const {org,user}=await access(request,{owner:true});
  const data=normalizeCarrier(request.data.carrier);
  const ref=org.collection('logisticsCarriers').doc(randomUUID());
  await ref.create({...data,createdBy:user,createdAt:stamp()});
  return {id:ref.id,connectionStatus:'manual',notice:'No carrier API has been activated'};
});
export const logisticsRegisterVehicle=callable(async request=>{
  const {org,user}=await access(request,{owner:true});
  const v=request.data.vehicle||{};
  const registration=String(v.registration||'').trim();
  if(!/^[A-Za-z0-9 -]{3,25}$/.test(registration))throw new Error('Invalid registration');
  const capacityKg=Number(v.capacityKg);
  if(!Number.isFinite(capacityKg)||capacityKg<=0||capacityKg>100000)throw new Error('Invalid vehicle capacity');
  const ref=org.collection('logisticsVehicles').doc(randomUUID());
  await ref.create({registration,capacityKg,available:v.available===true,
    driver:String(v.driver||'').slice(0,120),createdBy:user,createdAt:stamp()});
  return {id:ref.id};
});
export const logisticsCreateShipment=callable(async request=>{
  const {org,user}=await access(request);
  const input=normalizeShipment(request.data.shipment);
  if(input.carrierId){
    const connected=await org.collection('logisticsCarriers').doc(identifier(input.carrierId)).get();
    if(!connected.exists)throw new Error('Carrier has not been registered in this Workspace');
  }
  const id=createHash('sha256').update(input.reference.toUpperCase()).digest('hex').slice(0,40);
  const ref=org.collection('logisticsShipments').doc(id);
  try{await ref.create({...input,createdBy:user,createdAt:stamp(),updatedAt:stamp()});}
  catch(error){
    if(error.code===6||error.code==='already-exists')throw new HttpsError('already-exists','Shipment reference already exists');
    throw error;
  }
  return {shipmentId:id,status:'draft'};
});
export const logisticsRecordMilestone=callable(async request=>{
  const {org,user}=await access(request);
  const shipmentId=identifier(request.data.shipmentId);
  const input=normalizeMilestone(request.data.event);
  const ref=org.collection('logisticsShipments').doc(shipmentId);
  const eventRef=org.collection('logisticsMilestones').doc(randomUUID());
  return db.runTransaction(async tx=>{
    const snap=await tx.get(ref);
    if(!snap.exists)throw new HttpsError('not-found','Shipment not found');
    transitionShipment(snap.data().status,input.status);
    tx.update(ref,{status:input.status,updatedAt:stamp(),updatedBy:user});
    tx.create(eventRef,{...input,shipmentId,actor:user,createdAt:stamp()});
    return {shipmentId,status:input.status,eventId:eventRef.id};
  });
});
export const logisticsCompareTariffs=callable(async request=>{
  const {org}=await access(request);
  const shipmentId=identifier(request.data.shipmentId);
  const [shipment,carriers]=await Promise.all([
    org.collection('logisticsShipments').doc(shipmentId).get(),
    list(org.collection('logisticsCarriers'),100)
  ]);
  if(!shipment.exists)throw new HttpsError('not-found','Shipment not found');
  return {quotes:tariffComparison(shipment.data(),carriers),
    warning:'Indicative operator-entered tariffs only, not binding live carrier quotes'};
});
export const logisticsDispatchProposal=callable(async request=>{
  const {org}=await access(request);
  const [shipments,vehicles]=await Promise.all([
    list(org.collection('logisticsShipments'),150),
    list(org.collection('logisticsVehicles'),100)
  ]);
  return {...dispatchProposal(shipments,vehicles),
    warning:'Capacity-only proposal; no travel-time or traffic optimization. Human approval required before dispatch.'};
});
// Read-only live DHL Unified Tracking adapter. Requires approved developer access,
// per-provider terms, and the platform operator's DHL_UNIFIED_API_KEY secret.
export const logisticsTrackDhl=callable(async request=>{
  const {org,member}=await access(request);
  if(member.role!=='owner')throw new HttpsError('permission-denied','Owner approval required for paid provider lookups');
  const shipmentId=identifier(request.data.shipmentId);
  const shipment=(await org.collection('logisticsShipments').doc(shipmentId).get()).data();
  if(!shipment)throw new HttpsError('not-found','Shipment not found');
  const carrier=shipment.carrierId?
    (await org.collection('logisticsCarriers').doc(shipment.carrierId).get()).data():null;
  if(carrier?.providerId!=='dhl')throw new HttpsError('failed-precondition','This shipment is not assigned to a DHL carrier');
  const waybill=String(shipment.trackingNumber||'');
  if(!/^[A-Za-z0-9-]{5,50}$/.test(waybill))throw new HttpsError('invalid-argument','Valid DHL tracking number required');
  const key=dhlKey.value();
  if(!key)throw new HttpsError('failed-precondition','DHL credentials not configured');
  const url=new URL('https://api-eu.dhl.com/track/shipments');
  url.searchParams.set('trackingNumber',waybill);
  const response=await fetch(url,{headers:{'DHL-API-Key':key,Accept:'application/json'},
    signal:AbortSignal.timeout(12000),redirect:'error'});
  if(!response.ok)throw new HttpsError('unavailable','DHL tracking request failed ('+response.status+')');
  return {...trackingFromDhl(await response.json()),source:'DHL Unified Tracking API',persisted:false};
},[dhlKey]);

// Generic B2B carrier webhooks: tenant-specific short-lived credentials with
// SHA-256 stored at rest. A third-party carrier must opt in to this contract.
// No claim that DHL/FedEx/etc. natively use this format.
export const logisticsIssuePartnerToken=callable(async request=>{
  const {org,user}=await access(request,{owner:true});
  const carrierId=identifier(request.data.carrierId);
  if(!(await org.collection('logisticsCarriers').doc(carrierId).get()).exists)
    throw new HttpsError('not-found','Register the company first');
  const secret='tfl_'+randomBytes(32).toString('base64url');
  const tokenHash=createHash('sha256').update(secret).digest('hex');
  const expiresAt=Date.now()+90*24*60*60*1000;
  await org.collection('logisticsPartnerTokens').doc(carrierId).set({
    tokenHash,expiresAt,enabled:true,createdBy:user,createdAt:stamp()});
  return {carrierId,token:secret,expiresAt,
    notice:'Copy this one-time credential to the approved carrier. The secret cannot be retrieved again.'};
});
export const logisticsRevokePartnerToken=callable(async request=>{
  const {org}=await access(request,{owner:true});
  const carrierId=identifier(request.data.carrierId);
  await org.collection('logisticsPartnerTokens').doc(carrierId).delete();
  return {revoked:true,carrierId};
});
export const logisticsPartnerWebhook=onRequest({region,cors:false},async (req,res)=>{
  try{
    if(req.method!=='POST'){res.status(405).json({error:'Method not allowed'});return;}
    if((req.rawBody?.length||0)>8192){res.status(413).json({error:'Payload too large'});return;}
    const orgId=identifier(req.get('x-workspace-id'));
    const carrierId=identifier(req.get('x-carrier-id'));
    const secret=String(req.get('authorization')||'').replace(/^Bearer /i,'');
    if(!/^tfl_[A-Za-z0-9_-]{43}$/.test(secret)){res.status(401).json({error:'Unauthorized'});return;}
    const org=db.doc('organizations/'+orgId);
    const [token,carrier]=await Promise.all([
      org.collection('logisticsPartnerTokens').doc(carrierId).get(),
      org.collection('logisticsCarriers').doc(carrierId).get()
    ]);
    const credentials=token.data();
    if(!carrier.exists||!credentials?.enabled||credentials.expiresAt<Date.now()){
      res.status(401).json({error:'Unauthorized'});return;
    }
    const given=createHash('sha256').update(secret).digest();
    const expected=Buffer.from(credentials.tokenHash||'','hex');
    if(expected.length!==given.length||!timingSafeEqual(given,expected)){
      res.status(401).json({error:'Unauthorized'});return;
    }
    const shipmentId=identifier(req.body?.shipmentId);
    const eventId=identifier(req.body?.eventId);
    const input=normalizeMilestone(req.body?.event);
    const eventRef=org.collection('logisticsMilestones').doc(
      createHash('sha256').update(carrierId+':'+eventId).digest('hex'));
    const shipmentRef=org.collection('logisticsShipments').doc(shipmentId);
    const result=await db.runTransaction(async tx=>{
      const [shipment,prior]=await Promise.all([tx.get(shipmentRef),tx.get(eventRef)]);
      if(prior.exists)return {duplicate:true};
      if(!shipment.exists||shipment.data().carrierId!==carrierId)
        throw new Error('Shipment not assigned to this carrier');
      if(req.body?.trackingNumber&&String(req.body.trackingNumber)!==shipment.data().trackingNumber)
        throw new Error('Tracking number mismatch');
      transitionShipment(shipment.data().status,input.status);
      tx.update(shipmentRef,{status:input.status,updatedAt:stamp(),updatedBy:'partner:'+carrierId});
      tx.create(eventRef,{...input,source:'partner',carrierId,partnerEventId:eventId,
        shipmentId,actor:'partner:'+carrierId,createdAt:stamp()});
      return {accepted:true};
    });
    res.status(200).json(result);
  }catch(e){
    // Do not leak tenant/carrier/tracking identifiers to untrusted callbacks.
    res.status(400).json({error:'Invalid or unauthorized carrier event'});
  }
});
