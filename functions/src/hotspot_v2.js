// Hotspot v2: tenant-isolated inventory with strict schema and immutable audits.
// Entirely separate collections from legacy super-admin pilot records.
// No live router, payment, or access side effects.
import {randomUUID,randomBytes,createHmac} from 'node:crypto';
import {getFirestore,FieldValue} from 'firebase-admin/firestore';
import {onCall,HttpsError} from 'firebase-functions/v2/https';

const error=(code,message)=>{throw new HttpsError(code,message);};
const ident=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{5,100}$/.test(x);
const checkId=(x,label)=>{if(!ident(x))error('invalid-argument','Invalid '+label);return x;};
const input=(o,fields)=>{if(!o||typeof o!=='object'||Array.isArray(o)||Object.keys(o).some(x=>!fields.includes(x)))error('invalid-argument','Invalid input');};
const string=(o,key,max=100)=>{const v=o?.[key];if(typeof v!=='string'||v.trim().length<1||v.trim().length>max)error('invalid-argument','Invalid '+key);return v.trim();};
const integer=(o,key,min,max)=>{const v=o?.[key];if(!Number.isSafeInteger(v)||v<min||v>max)error('invalid-argument','Invalid '+key);return v;};
const call=fn=>onCall({region:'europe-west1',timeoutSeconds:45},fn);
const tenant=org=>getFirestore().collection('organizations').doc(org);
async function operator(req,allowed=['owner','admin','operator']){
 if(!req.auth)error('unauthenticated','Sign-in required');
 const org=checkId(req.data?.orgId,'organization');
 const member=await tenant(org).collection('members').doc(req.auth.uid).get();
 if(!member.exists||!allowed.includes(member.data()?.role))error('permission-denied','Insufficient workspace role');
 return {org,uid:req.auth.uid,root:tenant(org).collection('hotspotV2').doc('control')};
}
const collections={sites:'sites',plans:'plans',vouchers:'vouchers',audit:'audit'};
const path=(root,type)=>root.collection(collections[type]);
const audit=(tx,root,actor,action,target,details={})=>tx.create(path(root,'audit').doc(randomUUID()),{
 actor,action,target,details,createdAt:FieldValue.serverTimestamp()});
export const hotspotV2Catalog=call(async req=>{
 input(req.data,['orgId']);const {org}=await operator(req);
 return {orgId:org,version:2,resources:['sites','plans','vouchers'],liveGateway:false,livePayments:false,
  capabilities:['tenant-isolation','audit','secure-vouchers','scope-validation'],status:'control_plane_only'};
});
export const hotspotV2List=call(async req=>{
 input(req.data,['orgId','resource','limit','cursor']);const {root}=await operator(req);
 const resource=req.data.resource;
 if(!['sites','plans','vouchers'].includes(resource))error('invalid-argument','Unknown collection');
 const limit=req.data.limit===undefined?25:integer(req.data,'limit',1,50);
 const cursor=req.data.cursor;
 if(cursor!==undefined&&!ident(cursor))error('invalid-argument','Invalid cursor');
 let q=path(root,resource).orderBy('__name__').limit(limit+1);
 if(cursor)q=q.startAfter(cursor);
 const snap=await q.get();
 const docs=snap.docs.slice(0,limit);
 return {records:docs.map(d=>{
 const {secretHash,secretSalt,...safe}=d.data();
 return {id:d.id,...safe};
 }),nextCursor:snap.docs.length>limit?docs.at(-1).id:null,limit,resource};
});
export const hotspotV2Create=call(async req=>{
 input(req.data,['orgId','resource','record']);const {root,uid}=await operator(req,['owner','admin']);
 const resource=req.data.resource,record=req.data.record;let entry={},oneTimeCode=null;
 if(resource==='sites'){
  input(record,['name','ssid','location']);
  entry={name:string(record,'name'),ssid:string(record,'ssid',32),location:string(record,'location',120),
    state:'draft',gatewayVerified:false,published:false};
 }else if(resource==='plans'){
  input(record,['siteId','name','durationMinutes','downloadMbps','uploadMbps','maxDevices','priceKes']);
  entry={siteId:checkId(record.siteId,'site'),name:string(record,'name'),durationMinutes:integer(record,'durationMinutes',1,525600),
   downloadMbps:integer(record,'downloadMbps',1,10000),uploadMbps:integer(record,'uploadMbps',1,10000),
   maxDevices:integer(record,'maxDevices',1,100),priceKes:integer(record,'priceKes',0,1000000),state:'draft'};
 }else if(resource==='vouchers'){
  input(record,['siteId','planId']);
  entry={siteId:checkId(record.siteId,'site'),planId:checkId(record.planId,'plan'),state:'draft',
    redeemed:false,gatewayProvisioned:false,paymentVerified:false};
  oneTimeCode=randomBytes(16).toString('hex').toUpperCase();
  const secretSalt=randomBytes(16).toString('hex');
  entry.secretSalt=secretSalt;
  entry.secretHash=createHmac('sha256',Buffer.from(secretSalt,'hex')).update(oneTimeCode).digest('hex');
  entry.codeLast4=oneTimeCode.slice(-4);
 }else error('invalid-argument','Unsupported resource');
 const destination=path(root,resource).doc(randomUUID());
 await getFirestore().runTransaction(async tx=>{
   if(resource!=='sites'){
    const site=await tx.get(path(root,'sites').doc(entry.siteId));
    if(!site.exists)error('failed-precondition','Site does not exist in workspace');
    if(resource==='vouchers'){
     const plan=await tx.get(path(root,'plans').doc(entry.planId));
     if(!plan.exists||plan.data().siteId!==entry.siteId)error('failed-precondition','Plan does not belong to the site');
    }
   }
   tx.create(destination,{...entry,createdBy:uid,createdAt:FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp()});
   audit(tx,root,uid,'create',resource+':'+destination.id);
 });
 return {id:destination.id,oneTimeCode,networkActivated:false,paymentVerified:false};
});
export const hotspotV2Revoke=call(async req=>{
 input(req.data,['orgId','voucherId']);const {root,uid}=await operator(req,['owner','admin']);
 const voucherId=checkId(req.data.voucherId,'voucher'),ref=path(root,'vouchers').doc(voucherId);
 await getFirestore().runTransaction(async tx=>{
  const snap=await tx.get(ref);
  if(!snap.exists)error('not-found','Voucher not found');
  if(snap.data().state==='revoked')error('failed-precondition','Already revoked');
  tx.update(ref,{state:'revoked',revokedBy:uid,revokedAt:FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp()});
  audit(tx,root,uid,'revoke','vouchers:'+voucherId);
 });
 return {revoked:true,gatewayDisconnectExecuted:false};
});
