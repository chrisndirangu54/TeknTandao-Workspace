// Two-person laboratory commissioning and free-voucher authorization.
// Human-supplied field evidence is explicitly an attestation, not remote hardware telemetry.
// Paid voucher activation is intentionally excluded.
import {randomUUID} from 'node:crypto';
import {getFirestore,FieldValue} from 'firebase-admin/firestore';
import {onCall,HttpsError} from 'firebase-functions/v2/https';
const fail=(code,message)=>{throw new HttpsError(code,message);};
const id=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{5,100}$/.test(x);
const shape=(obj,keys)=>{if(!obj||typeof obj!=='object'||Array.isArray(obj)||Object.keys(obj).some(k=>!keys.includes(k)))fail('invalid-argument','Unexpected fields');};
const call=fn=>onCall({region:'europe-west1',timeoutSeconds:45},fn);
async function admin(req){
 if(!req.auth)fail('unauthenticated','Authentication required');
 const orgId=req.data?.orgId;if(!id(orgId))fail('invalid-argument','Invalid organization');
 const org=getFirestore().collection('organizations').doc(orgId);
 const member=await org.collection('members').doc(req.auth.uid).get();
 if(!member.exists||!['owner','admin'].includes(member.data()?.role))fail('permission-denied','Administrator required');
 return {uid:req.auth.uid,root:org.collection('hotspotV2').doc('control')};
}
const audit=(tx,root,uid,event,target)=>tx.create(root.collection('audit').doc(randomUUID()),{
 actor:uid,action:event,resource:target,at:FieldValue.serverTimestamp()});
export const hotspotV2RequestLabGateway=call(async req=>{
 shape(req.data,['orgId','siteId','fieldEvidence']);
 const {uid,root}=await admin(req),siteId=req.data.siteId,e=req.data.fieldEvidence;
 if(!id(siteId)||!e||typeof e!=='object'||Array.isArray(e)||
  Object.keys(e).some(k=>!['routerTestRef','radiusTestRef','accountingTestRef','isolationTestRef'].includes(k))||
  ['routerTestRef','radiusTestRef','accountingTestRef','isolationTestRef'].some(k=>!id(e[k])))
   fail('invalid-argument','Four distinct field test references required');
 const site=root.collection('sites').doc(siteId),review=root.collection('labGatewayReviews').doc(siteId);
 await getFirestore().runTransaction(async tx=>{
  const [s,existing]=await Promise.all([tx.get(site),tx.get(review)]);
  if(!s.exists||s.data().state!=='commissioned'||s.data().gatewayVerified===true)
    fail('failed-precondition','Commissioned unverified site required');
  if(existing.exists)fail('already-exists','Review already exists');
  tx.create(review,{siteId,fieldEvidence:e,requestedBy:uid,state:'awaiting_second_admin',
    requestedAt:FieldValue.serverTimestamp(),labOnly:true});
  audit(tx,root,uid,'lab_gateway_review_requested','sites:'+siteId);
 });
 return {ok:true,approved:false,gatewayVerified:false,labOnly:true};
});
export const hotspotV2ApproveLabGateway=call(async req=>{
 shape(req.data,['orgId','siteId']);
 const {uid,root}=await admin(req),siteId=req.data.siteId;
 if(!id(siteId))fail('invalid-argument','Invalid site');
 const site=root.collection('sites').doc(siteId),review=root.collection('labGatewayReviews').doc(siteId);
 await getFirestore().runTransaction(async tx=>{
  const [s,r]=await Promise.all([tx.get(site),tx.get(review)]);
  if(!s.exists||s.data().state!=='commissioned'||!r.exists||r.data().state!=='awaiting_second_admin')
    fail('failed-precondition','Pending site review required');
  if(r.data().requestedBy===uid)fail('permission-denied','Independent approver required');
  tx.update(site,{gatewayVerified:true,radiusEnabled:true,labOnly:true,
    verificationMethod:'two_person_manual_field_attestation',verifiedBy:uid,
    verifiedAt:FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp()});
  tx.update(review,{state:'approved_lab',approvedBy:uid,approvedAt:FieldValue.serverTimestamp()});
  audit(tx,root,uid,'lab_gateway_review_approved','sites:'+siteId);
 });
 return {ok:true,siteId,labOnly:true,verificationMethod:'operator_attested_not_device_proven'};
});
export const hotspotV2RequestFreePass=call(async req=>{
 shape(req.data,['orgId','voucherId']);
 const {uid,root}=await admin(req),voucherId=req.data.voucherId;
 if(!id(voucherId))fail('invalid-argument','Invalid voucher');
 const ref=root.collection('vouchers').doc(voucherId),review=root.collection('labVoucherReviews').doc(voucherId);
 await getFirestore().runTransaction(async tx=>{
  const [v,prior]=await Promise.all([tx.get(ref),tx.get(review)]);
  if(!v.exists||v.data().state!=='issued'||prior.exists)
   fail('failed-precondition','Issued free voucher and no prior review required');
  const [site,plan]=await Promise.all([tx.get(root.collection('sites').doc(v.data().siteId)),
   tx.get(root.collection('plans').doc(v.data().planId))]);
  if(!site.exists||!plan.exists||site.data().radiusEnabled!==true||
   site.data().gatewayVerified!==true||site.data().labOnly!==true||
   plan.data().siteId!==site.id||plan.data().state!=='published'||plan.data().priceKes!==0)
   fail('failed-precondition','Only published free plans at approved laboratory sites');
  tx.create(review,{voucherId,requestedBy:uid,state:'awaiting_second_admin',
   requestedAt:FieldValue.serverTimestamp(),labOnly:true});
  audit(tx,root,uid,'lab_voucher_review_requested','vouchers:'+voucherId);
 });
 return {ok:true,approved:false,networkActivated:false};
});
export const hotspotV2ApproveFreePass=call(async req=>{
 shape(req.data,['orgId','voucherId']);
 const {uid,root}=await admin(req),voucherId=req.data.voucherId;
 if(!id(voucherId))fail('invalid-argument','Invalid voucher');
 const ref=root.collection('vouchers').doc(voucherId),review=root.collection('labVoucherReviews').doc(voucherId);
 await getFirestore().runTransaction(async tx=>{
  const [v,r]=await Promise.all([tx.get(ref),tx.get(review)]);
  if(!v.exists||v.data().state!=='issued'||!r.exists||r.data().state!=='awaiting_second_admin')
   fail('failed-precondition','Pending free voucher review required');
  if(r.data().requestedBy===uid)fail('permission-denied','Independent approver required');
  const [site,plan]=await Promise.all([tx.get(root.collection('sites').doc(v.data().siteId)),
   tx.get(root.collection('plans').doc(v.data().planId))]);
  if(!site.exists||!plan.exists||site.data().radiusEnabled!==true||
   site.data().gatewayVerified!==true||site.data().labOnly!==true||
   plan.data().state!=='published'||plan.data().siteId!==site.id||plan.data().priceKes!==0||
   !Number.isSafeInteger(plan.data().durationMinutes)||plan.data().durationMinutes<1||
   plan.data().durationMinutes>1440)
   fail('failed-precondition','Site and short-duration free test plan required');
  const expiry=Date.now()+plan.data().durationMinutes*60000;
  tx.update(ref,{state:'provisioned',gatewayProvisioned:true,labOnly:true,
   expiresAtMs:expiry,authorizedBy:uid,authorizedAt:FieldValue.serverTimestamp(),
   updatedAt:FieldValue.serverTimestamp()});
  tx.update(review,{state:'approved_lab',approvedBy:uid,approvedAt:FieldValue.serverTimestamp()});
  audit(tx,root,uid,'lab_voucher_prepared_for_radius','vouchers:'+voucherId);
 });
 return {ok:true,labOnly:true,backendCredentialValidatedOnlyOnAccess:true,
   routerCommandExecuted:false};
});

export const hotspotV2RequestPaidLabPass=call(async req=>{
 shape(req.data,['orgId','voucherId']);
 const {uid,root}=await admin(req),voucherId=req.data.voucherId;
 if(!id(voucherId))fail('invalid-argument','Invalid voucher');
 const voucher=root.collection('vouchers').doc(voucherId);
 const review=root.collection('labVoucherReviews').doc(voucherId);
 await getFirestore().runTransaction(async tx=>{
  const [v,existing]=await Promise.all([tx.get(voucher),tx.get(review)]);
  if(!v.exists||v.data().state!=='issued'||existing.exists)fail('failed-precondition','Issued voucher and no existing review required');
  const [site,plan,payment]=await Promise.all([
    tx.get(root.collection('sites').doc(v.data().siteId)),
    tx.get(root.collection('plans').doc(v.data().planId)),
    tx.get(root.collection('paymentIntents').doc(voucherId))
  ]);
  if(!site.exists||!plan.exists||!payment.exists||
    site.data().gatewayVerified!==true||site.data().radiusEnabled!==true||site.data().labOnly!==true||
    plan.data().siteId!==site.id||plan.data().state!=='published'||plan.data().priceKes<=0||
    payment.data().provider!=='paystack_mpesa_test'||payment.data().state!=='verified'||
    payment.data().receiptVerified!==true||!payment.data().providerVerifiedAt||
    payment.data().siteId!==site.id||payment.data().planId!==plan.id||
    payment.data().voucherId!==voucherId||payment.data().amountKes!==plan.data().priceKes)
    fail('failed-precondition','Independently verified Paystack test payment and lab gateway required');
  tx.create(review,{voucherId,requestedBy:uid,state:'awaiting_second_admin',
   requestedAt:FieldValue.serverTimestamp(),labOnly:true,paymentMode:'paystack_mpesa_test'});
  audit(tx,root,uid,'paid_lab_voucher_review_requested','vouchers:'+voucherId);
 });
 return {ok:true,approved:false,networkActivated:false};
});
export const hotspotV2ApprovePaidLabPass=call(async req=>{
 shape(req.data,['orgId','voucherId']);
 const {uid,root}=await admin(req),voucherId=req.data.voucherId;
 if(!id(voucherId))fail('invalid-argument','Invalid voucher');
 const voucher=root.collection('vouchers').doc(voucherId),review=root.collection('labVoucherReviews').doc(voucherId);
 await getFirestore().runTransaction(async tx=>{
  const [v,r]=await Promise.all([tx.get(voucher),tx.get(review)]);
  if(!v.exists||v.data().state!=='issued'||!r.exists||r.data().state!=='awaiting_second_admin'||
    r.data().paymentMode!=='paystack_mpesa_test')
    fail('failed-precondition','Pending paid lab review required');
  if(r.data().requestedBy===uid)fail('permission-denied','Independent approver required');
  const [site,plan,payment]=await Promise.all([
    tx.get(root.collection('sites').doc(v.data().siteId)),
    tx.get(root.collection('plans').doc(v.data().planId)),
    tx.get(root.collection('paymentIntents').doc(voucherId))
  ]);
  if(!site.exists||!plan.exists||!payment.exists||
    site.data().radiusEnabled!==true||site.data().gatewayVerified!==true||site.data().labOnly!==true||
    plan.data().state!=='published'||plan.data().siteId!==site.id||
    !Number.isSafeInteger(plan.data().priceKes)||plan.data().priceKes<1||
    payment.data().provider!=='paystack_mpesa_test'||payment.data().state!=='verified'||
    payment.data().receiptVerified!==true||!payment.data().providerVerifiedAt||
    payment.data().siteId!==site.id||payment.data().planId!==plan.id||
    payment.data().voucherId!==voucherId||payment.data().amountKes!==plan.data().priceKes||
    !Number.isSafeInteger(plan.data().durationMinutes)||plan.data().durationMinutes<1||
    plan.data().durationMinutes>1440)
    fail('failed-precondition','Verified paid sandbox plan and approved site required');
  tx.update(voucher,{state:'provisioned',gatewayProvisioned:true,labOnly:true,
    expiresAtMs:Date.now()+plan.data().durationMinutes*60000,
    authorizedBy:uid,authorizedAt:FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp()});
  tx.update(review,{state:'approved_lab',approvedBy:uid,approvedAt:FieldValue.serverTimestamp()});
  audit(tx,root,uid,'paid_lab_voucher_prepared_for_radius','vouchers:'+voucherId);
 });
 return {ok:true,labOnly:true,radiusAdmissionEligible:true,routerCommandExecuted:false};
});
