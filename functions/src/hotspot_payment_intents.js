// Immutable pilot checkout intents. Not a payment gateway and never activates access.
import {randomUUID} from 'node:crypto';
import {getFirestore,FieldValue} from 'firebase-admin/firestore';
import {onCall,HttpsError} from 'firebase-functions/v2/https';
import {isSuperAdminToken} from './super_admin_domain.js';
const fail=(code,message)=>{throw new HttpsError(code,message);};
const id=value=>{if(typeof value!=='string'||!/^[a-zA-Z0-9_-]{5,100}$/.test(value))fail('invalid-argument','Invalid identifier');return value;};
const admin=req=>{if(!req.auth)fail('unauthenticated','Sign-in required');if(!isSuperAdminToken(req.auth.token||{}))fail('permission-denied','Super-admin access required');return req.auth.uid;};
const db=()=>getFirestore();
const strict=(obj,keys)=>{if(!obj||typeof obj!=='object'||Array.isArray(obj)||Object.keys(obj).some(k=>!keys.includes(k)))fail('invalid-argument','Invalid parameters');};
export const hotspotCreatePaymentIntent=onCall({region:'europe-west1',timeoutSeconds:30},async req=>{
 const actor=admin(req);strict(req.data,['voucherId']);const voucherId=id(req.data.voucherId);
 const paymentRef=db().collection('hotspotPaymentIntents').doc(voucherId);
 const voucherRef=db().collection('hotspotVouchers').doc(voucherId);
 const auditRef=db().collection('hotspotAudit').doc(randomUUID());
 await db().runTransaction(async tx=>{
  const prior=await tx.get(paymentRef);if(prior.exists)fail('already-exists','Payment intent already exists');
  const voucher=await tx.get(voucherRef);if(!voucher.exists||voucher.data().status!=='unissued'||voucher.data().redeemed!==false)fail('failed-precondition','Voucher must be unissued');
  const plan=await tx.get(db().collection('hotspotPlans').doc(voucher.data().planId));
  const site=await tx.get(db().collection('hotspotSites').doc(voucher.data().siteId));
  if(!plan.exists||!site.exists||site.data().status!=='active'||plan.data().status!=='active'||plan.data().siteId!==site.id)fail('failed-precondition','Active site and matching published plan required');
  if(!Number.isSafeInteger(plan.data().priceKes)||plan.data().priceKes<=0)fail('failed-precondition','Intent requires positive plan price');
  tx.create(paymentRef,{id:voucherId,voucherId,siteId:site.id,planId:plan.id,
   amountKes:plan.data().priceKes,currency:'KES',status:'draft',receiptVerified:false,
   paymentProvider:null,checkoutRequestId:null,merchantAccount:null,createdBy:actor,
   createdAt:FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp()});
  tx.create(auditRef,{actor,action:'payment_intent_created',resource:'hotspotPaymentIntents',resourceId:voucherId,at:FieldValue.serverTimestamp()});
 });
 return {ok:true,id:voucherId,status:'draft',paymentRequested:false,accessActivated:false};
});
export const hotspotPaymentIntentStatus=onCall({region:'europe-west1'},async req=>{
 admin(req);strict(req.data,['voucherId']);const doc=await db().collection('hotspotPaymentIntents').doc(id(req.data.voucherId)).get();
 if(!doc.exists)fail('not-found','Payment intent not found');
 const value=doc.data();
 return {id:doc.id,status:value.status,amountKes:value.amountKes,currency:'KES',
  receiptVerified:value.receiptVerified===true,providerVerified:false,
  routerActivated:false,source:'record_only'};
});
