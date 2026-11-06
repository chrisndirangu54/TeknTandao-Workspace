// Operational requests for Hotspot v2: auditable and fail-closed.
// No direct router transport, credential export, or payment settlement.
import {randomUUID} from 'node:crypto';
import {getFirestore,FieldValue} from 'firebase-admin/firestore';
import {onCall,HttpsError} from 'firebase-functions/v2/https';
import {canManageHotspot} from './hotspot_v2_domain.js';
import {decideVoucherTransition} from './hotspot_lifecycle_domain.js';
const fail=(code,message)=>{throw new HttpsError(code,message);};
const valid=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{5,100}$/.test(x);
const check=x=>{if(!valid(x))fail('invalid-argument','Invalid ID');return x;};
const shape=(data,fields)=>{if(!data||typeof data!=='object'||Array.isArray(data)||Object.keys(data).some(k=>!fields.includes(k)))fail('invalid-argument','Unexpected fields');};
const orgRoot=org=>getFirestore().collection('organizations').doc(org);
const control=org=>orgRoot(org).collection('hotspotV2').doc('control');
const audit=(tx,root,actor,action,ref)=>tx.create(root.collection('audit').doc(randomUUID()),{actor,action,resource:ref,createdAt:FieldValue.serverTimestamp()});
const callable=fn=>onCall({region:'europe-west1',timeoutSeconds:45},fn);
async function authorized(req,action='create'){
 if(!req.auth)fail('unauthenticated','Sign in required');
 const org=check(req.data?.orgId),uid=req.auth.uid,member=await orgRoot(org).collection('members').doc(uid).get();
 const policy=canManageHotspot({actorUid:uid,requestedOrgId:org,
  membership:member.exists?{uid:member.id,workspaceId:org,role:member.data().role}:null,action});
 if(!policy.allowed)fail('permission-denied','Unauthorized workspace operation');
 return {uid,root:control(org)};
}
// Owners can review site readiness; this does NOT assert that a real NAS is online.
export const hotspotV2CommissionSite=callable(async req=>{
 shape(req.data,['orgId','siteId','checks','nasId']);
 const {uid,root}=await authorized(req);
 const siteId=check(req.data.siteId),nasId=check(req.data.nasId),checks=req.data.checks;
 const needed=['vlanIsolated','radiusTested','accountingTested','noticePublished'];
 if(!checks||typeof checks!=='object'||Array.isArray(checks)||Object.keys(checks).some(k=>!needed.includes(k))||needed.some(k=>checks[k]!==true))
   fail('failed-precondition','Commissioning checklists must be explicitly confirmed');
 const site=root.collection('sites').doc(siteId);
 await getFirestore().runTransaction(async tx=>{
   const prior=await tx.get(site);
   if(!prior.exists||prior.data().state!=='draft')fail('failed-precondition','Only draft sites can be commissioned');
   tx.update(site,{state:'commissioned',nasId,commissionedBy:uid,commissionedAt:FieldValue.serverTimestamp(),
      gatewayVerified:false,updatedAt:FieldValue.serverTimestamp()});
   audit(tx,root,uid,'commission_attested','sites:'+siteId);
 });
 return {ok:true,siteId,gatewayVerified:false,routerConnected:false};
});
export const hotspotV2PublishPlan=callable(async req=>{
 shape(req.data,['orgId','planId']);
 const {uid,root}=await authorized(req);const planId=check(req.data.planId),plan=root.collection('plans').doc(planId);
 await getFirestore().runTransaction(async tx=>{
  const p=await tx.get(plan);
  if(!p.exists||p.data().state!=='draft')fail('failed-precondition','Only draft plans can publish');
  const site=await tx.get(root.collection('sites').doc(p.data().siteId));
  if(!site.exists||site.data().state!=='commissioned')fail('failed-precondition','Commission site first');
  tx.update(plan,{state:'published',publishedBy:uid,publishedAt:FieldValue.serverTimestamp()});
  audit(tx,root,uid,'publish','plans:'+planId);
 });
 return {ok:true,routerChanged:false};
});
export const hotspotV2PrepareVoucher=callable(async req=>{
 shape(req.data,['orgId','voucherId']);
 const {uid,root}=await authorized(req);
 const voucherId=check(req.data.voucherId),ref=root.collection('vouchers').doc(voucherId);
 await getFirestore().runTransaction(async tx=>{
  const v=await tx.get(ref);if(!v.exists)fail('not-found','Voucher missing');
  const plan=await tx.get(root.collection('plans').doc(v.data().planId));
  const site=await tx.get(root.collection('sites').doc(v.data().siteId));
  if(!plan.exists||!site.exists)fail('failed-precondition','Broken references');
  const target=plan.data().priceKes>0?'pending_payment':'issued';
  const policy=decideVoucherTransition({voucher:{id:v.id,...v.data()},target,
     plan:{id:plan.id,...plan.data()},site:{id:site.id,...site.data()},actorUid:uid});
  if(!policy.allowed)fail('failed-precondition',policy.reason);
  tx.update(ref,{state:target,updatedAt:FieldValue.serverTimestamp()});
  audit(tx,root,uid,'state:'+target,'vouchers:'+voucherId);
 });
 return {ok:true,networkActivated:false,paymentVerified:false};
});
// Revoke is transactionally recorded; the gateway's eventual disconnect must be
// driven by a separately authenticated, independently approved operator.
export const hotspotV2RequestDisconnect=callable(async req=>{
 shape(req.data,['orgId','voucherId','reason']);
 const {uid,root}=await authorized(req);
 const voucherId=check(req.data.voucherId);
 const reason=req.data.reason;
 if(typeof reason!=='string'||reason.trim().length<8||reason.length>200)fail('invalid-argument','Reason required');
 const vref=root.collection('vouchers').doc(voucherId);
 const requestRef=root.collection('gatewayRequests').doc('disconnect_'+voucherId);
 await getFirestore().runTransaction(async tx=>{
  const voucher=await tx.get(vref),existing=await tx.get(requestRef);
  if(!voucher.exists||voucher.data().state!=='revoked')fail('failed-precondition','Voucher must be revoked');
  if(existing.exists)fail('already-exists','Disconnect request exists');
  tx.create(requestRef,{voucherId,siteId:voucher.data().siteId,operation:'disconnect',state:'awaiting_independent_approval',
    reason:reason.trim(),requestedBy:uid,requestedAt:FieldValue.serverTimestamp(),executed:false});
  audit(tx,root,uid,'disconnect_requested','vouchers:'+voucherId);
 });
 return {ok:true,disconnected:false,approvalRequired:true};
});
