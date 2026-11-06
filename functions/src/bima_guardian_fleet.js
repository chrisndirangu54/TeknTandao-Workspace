import {getFirestore,FieldValue} from 'firebase-admin/firestore';
import {onCall,HttpsError} from 'firebase-functions/v2/https';
import {defineSecret} from 'firebase-functions/params';
import {identifier,canAccess} from './domain.js';
import {bimaFleetQuoteInput,bimaNormalizeQuote,bimaManualPolicy,bimaRenewal}
  from './bima_guardian_fleet_domain.js';
const db=getFirestore();
const bimaKey=defineSecret('BIMA_API_KEY');
const region='europe-west1',stamp=()=>FieldValue.serverTimestamp();
const id=identifier;
function callable(fn,secrets=[]) {
  return onCall({region,secrets},async request=>{
    try{return await fn(request);}
    catch(error){
      if(error instanceof HttpsError)throw error;
      throw new HttpsError('failed-precondition',
        error instanceof Error?error.message:'Insurance request failed');
    }
  });
}
async function owner(request) {
  if(!request.auth?.uid)throw new HttpsError('unauthenticated','Sign in');
  const org=db.doc('organizations/'+id(request.data?.orgId));
  const member=(await org.collection('members').doc(request.auth.uid).get()).data();
  if(member?.role!=='owner')throw new HttpsError('permission-denied','Workspace owner required');
  const [f,g]=await Promise.all(['fleet','freight'].map(x=>org.collection('apps').doc(x).get()));
  if(!canAccess(member,'fleet',f.data())&&!canAccess(member,'freight',g.data()))
    throw new HttpsError('permission-denied','Fleet or Freight entitlement required');
  return {org,uid:request.auth.uid};
}
function urlBase() {
  let url;
  try{url=new URL(process.env.BIMA_API_BASE_URL||'');}
  catch{throw new HttpsError('failed-precondition','Bima Guardian HTTPS gateway not configured');}
  if(url.protocol!=='https:'||url.username||url.password||url.hash||url.search||
     !url.hostname.includes('.')||url.hostname==='localhost'||
     /^\d+\.\d+\.\d+\.\d+$/.test(url.hostname))
    throw new HttpsError('failed-precondition','Invalid secure Bima Guardian gateway');
  return url.toString().replace(/\/$/,'');
}
async function consent(org) {
  const doc=(await org.collection('fleetBimaConsents').doc('guardian').get()).data();
  if(doc?.enabled!==true||doc.scope!=='fleet_motor_quote_only'||
     typeof doc.expiresAtMs!=='number'||doc.expiresAtMs<=Date.now())
    throw new HttpsError('permission-denied','Current owner insurance disclosure consent required');
}
export const logisticsBimaGuardianConsent=callable(async request=>{
  const {org,uid}=await owner(request);
  if(typeof request.data.enabled!=='boolean'||
     (request.data.enabled&&request.data.acknowledgedLimitedDisclosure!==true))
    throw new HttpsError('invalid-argument','An explicit data-sharing decision is required');
  const enabled=request.data.enabled;
  const expiresAtMs=enabled?Date.now()+30*86400000:Date.now();
  await org.collection('fleetBimaConsents').doc('guardian').set({
    provider:'bima_guardian',enabled,scope:'fleet_motor_quote_only',
    expiresAtMs,changedBy:uid,changedAt:stamp()
  });
  return {enabled,expiresAtMs};
});
export const logisticsBimaGuardianOverview=callable(async request=>{
  const {org}=await owner(request);
  const [permission,policies,quotes,claims]=await Promise.all([
    org.collection('fleetBimaConsents').doc('guardian').get(),
    org.collection('fleetBimaPolicies').limit(80).get(),
    org.collection('fleetBimaQuotes').limit(60).get(),
    org.collection('fleetBimaClaims').limit(60).get()
  ]);
  const p=permission.data();
  return {provider:'bima_guardian',
    consentActive:p?.enabled===true&&p.expiresAtMs>Date.now(),
    liveInsurerConnection:false,
    policies:policies.docs.map(x=>({id:x.id,...x.data(),renewal:bimaRenewal(x.data())})),
    quotes:quotes.docs.map(x=>({id:x.id,...x.data()})),
    claims:claims.docs.map(x=>({id:x.id,...x.data()})),
    note:'Operator policies are unverified; claims remain local drafts; quotes never bind an insurer.'};
});
export const logisticsBimaGuardianQuote=callable(async request=>{
  const {org,uid}=await owner(request);
  await consent(org);
  const requestData=bimaFleetQuoteInput(request.data);
  if(!(await org.collection('logisticsVehicles').doc(requestData.vehicleId).get()).exists)
    throw new HttpsError('not-found','Register vehicle before requesting insurance');
  if(!bimaKey.value())throw new HttpsError('failed-precondition','Bima API key not configured');
  let result;
  try{
    const response=await fetch(urlBase()+'/v1/quotes',{
      method:'POST',redirect:'error',signal:AbortSignal.timeout(15000),
      headers:{'content-type':'application/json','x-api-key':bimaKey.value()},
      body:JSON.stringify({product:'motor',subtype:requestData.subtype,
        sumInsured:requestData.sumInsured,audience:'fleet_logistics'})
    });
    if(!response.ok)throw new Error('Gateway unavailable');
    const raw=await response.text();
    if(raw.length>100000)throw new Error('Oversize gateway response');
    result=bimaNormalizeQuote(JSON.parse(raw));
  }catch {throw new HttpsError('unavailable','Bima Guardian quotation provider unavailable');}
  const ref=org.collection('fleetBimaQuotes').doc();
  await ref.create({...result,vehicleId:requestData.vehicleId,
    subtype:requestData.subtype,sumInsuredKes:requestData.sumInsured,
    createdBy:uid,createdAt:stamp()});
  return {quoteId:ref.id,vehicleId:requestData.vehicleId,...result};
},[bimaKey]);
export const logisticsBimaGuardianRecordPolicy=callable(async request=>{
  const {org,uid}=await owner(request);
  const policy=bimaManualPolicy(request.data);
  if(!(await org.collection('logisticsVehicles').doc(policy.vehicleId).get()).exists)
    throw new HttpsError('not-found','Unknown Workspace vehicle');
  const ref=org.collection('fleetBimaPolicies').doc();
  await ref.create({...policy,recordedBy:uid,recordedAt:stamp()});
  return {id:ref.id,verificationStatus:'unverified',
    note:'Policy entry is operator-reported; coverage is not verified with an insurer.'};
});
export const logisticsBimaGuardianDraftClaim=callable(async request=>{
  const {org,uid}=await owner(request);
  const policyId=id(request.data?.policyId);
  const policy=(await org.collection('fleetBimaPolicies').doc(policyId).get()).data();
  if(!policy)throw new HttpsError('not-found','Policy record not found');
  const description=String(request.data?.description||'').trim();
  if(description.length<10||description.length>500)
    throw new HttpsError('invalid-argument','A 10–500 character incident description is required');
  const shipmentId=request.data?.shipmentId?id(request.data.shipmentId):null;
  if(shipmentId&&!(await org.collection('logisticsShipments').doc(shipmentId).get()).exists)
    throw new HttpsError('not-found','Shipment not found');
  const ref=org.collection('fleetBimaClaims').doc();
  await ref.create({vehicleId:policy.vehicleId,policyId,
    shipmentId,description,status:'draft_unsubmitted',
    sentToInsurer:false,source:'local_intake',createdBy:uid,createdAt:stamp()});
  return {id:ref.id,status:'draft_unsubmitted',
    note:'This claim has not been submitted to Bima Guardian or an insurer.'};
});
