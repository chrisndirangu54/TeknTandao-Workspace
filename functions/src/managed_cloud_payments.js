// Managed cloud prepaid subscription billing. No deployment on pending payment.
import './index.js';
import {randomBytes,randomUUID} from 'node:crypto';
import {getFirestore,FieldValue} from 'firebase-admin/firestore';
import {onCall,HttpsError} from 'firebase-functions/v2/https';
import {defineSecret} from 'firebase-functions/params';
import {z} from 'zod';
import {identifier} from './domain.js';
import {initializePaystack,verifyTransaction} from './providers.js';
import {cloudPlanCatalog} from './managed_cloud_domain.js';
import {cloudPaymentDecision,isCloudServicePaid} from './managed_cloud_billing_domain.js';
const secret=defineSecret('CLOUD_PAYSTACK_SECRET_KEY'),db=getFirestore(),region='europe-west1';
async function context(req) {
 if(!req.auth)throw new HttpsError('unauthenticated','Sign in');
 const org=db.doc('organizations/'+identifier(req.data?.orgId));
 const member=await org.collection('members').doc(req.auth.uid).get();
 if(member.data()?.role!=='owner')throw new HttpsError('permission-denied','Workspace owner required');
 return {org,uid:req.auth.uid};
}
const key=()=>{
 const v=secret.value();
 if(typeof v!=='string'||(!v.startsWith('sk_test_')&&!v.startsWith('sk_live_')))
  throw new HttpsError('failed-precondition','Cloud Paystack merchant credentials not configured');
 return v;
};
const projectRef=(org,id)=>org.collection('managedCloudProjects').doc(z.string().uuid().parse(id));
const billingRef=(org,id)=>org.collection('managedCloudBilling').doc(id);
const onlyEmail=z.string().email().max(254);
const cleanPhone=z.string().regex(/^\+?254[17][0-9]{8}$/);
export const cloudStartSubscriptionCheckout=onCall({
 region,enforceAppCheck:true,secrets:[secret],timeoutSeconds:45
},async req=>{
 const {org,uid}=await context(req);
 const input=z.object({projectId:z.string().uuid(),plan:z.enum(['starter','growth','business']),
  method:z.enum(['paystack','mpesa']),email:onlyEmail,
  phone:cleanPhone.optional(),customerConfirmed:z.literal(true)}).strict().parse(req.data?.checkout);
 const project=await projectRef(org,input.projectId).get();
 if(!project.exists)throw new HttpsError('not-found','Cloud project not found');
 if(input.method==='mpesa'&&!input.phone)throw new HttpsError('invalid-argument','M-Pesa phone required');
 const plan=cloudPlanCatalog[input.plan],ref='TC'+randomBytes(14).toString('hex');
 const payment=db.collection('managedCloudCheckoutOrders').doc(ref);
 const config={orgId:org.id,projectId:input.projectId,plan:input.plan,priceKes:plan.priceKes,
  method:input.method,status:'initiating',reference:ref,createdBy:uid,
  receiptVerified:false,createdAt:FieldValue.serverTimestamp()};
 await payment.create(config);
 const merchant=key();
 try{
  let response;
  if(input.method==='paystack') {
   const result=await initializePaystack({secret:merchant,email:input.email,amount:plan.priceKes*100,reference:ref});
   response={authorizationUrl:result.authorization_url,reference:ref,method:'paystack'};
  }else{
   const call=await fetch('https://api.paystack.co/charge',{
    method:'POST',signal:AbortSignal.timeout(18000),
    headers:{authorization:'Bearer '+merchant,'content-type':'application/json'},
    body:JSON.stringify({email:input.email,amount:plan.priceKes*100,currency:'KES',reference:ref,
      mobile_money:{phone:input.phone.startsWith('+')?input.phone:'+'+input.phone,provider:'mpesa'}})
   });
   if(!call.ok)throw new Error('Merchant unavailable');
   const body=await call.json();
   if(body.status!==true||body.data?.reference!==ref)throw new Error('Invalid merchant response');
   response={reference:ref,method:'mpesa',
    instruction:String(body.data.display_text||'Approve payment on your M-Pesa phone').slice(0,300)};
  }
  await payment.update({status:'pending_verification',updatedAt:FieldValue.serverTimestamp()});
  return {...response,status:'pending_verification',deployed:false,
   amountKes:plan.priceKes,currency:'KES'};
 }catch(_){
  await payment.update({status:'initiation_unknown',updatedAt:FieldValue.serverTimestamp()});
  throw new HttpsError('unavailable','Payment initiation state unknown. Verify the reference before trying again.');
 }
});
export const cloudVerifySubscriptionCheckout=onCall({
 region,enforceAppCheck:true,secrets:[secret],timeoutSeconds:45
},async req=>{
 const {org}=await context(req);
 const reference=z.string().regex(/^TC[a-f0-9]{28}$/).parse(req.data?.reference);
 const payment=db.collection('managedCloudCheckoutOrders').doc(reference);
 const order=await payment.get();
 if(!order.exists||order.data().orgId!==org.id)throw new HttpsError('not-found','Checkout not found');
 if(order.data().status==='paid'){
  const bill=(await billingRef(org,order.data().projectId).get()).data();
  return {status:'paid',paidUntilMs:bill?.paidUntilMs||null,verified:true};
 }
 if(!['pending_verification','initiation_unknown'].includes(order.data().status))
  throw new HttpsError('failed-precondition','Checkout is not verifiable');
 let verified;
 try{verified=await verifyTransaction(key(),reference);}
 catch(_){throw new HttpsError('unavailable','Provider verification unavailable');}
 const decision=cloudPaymentDecision(order.data(),verified);
 if(!decision.valid)return {status:'pending_verification',verified:false,reason:decision.reason};
 const receipt=db.collection('managedCloudProviderReceipts').doc(decision.providerTransactionId);
 const bill=billingRef(org,order.data().projectId);
 let paidUntilMs=0;
 await db.runTransaction(async tx=>{
  const [p,existing,b]=await Promise.all([tx.get(payment),tx.get(receipt),tx.get(bill)]);
  if(p.data()?.status==='paid') {paidUntilMs=b.data()?.paidUntilMs||0;return;}
  if(p.data()?.status!=='pending_verification'&&p.data()?.status!=='initiation_unknown')
   throw new HttpsError('failed-precondition','Checkout changed state');
  if(existing.exists)throw new HttpsError('already-exists','Receipt already used');
  const now=Date.now(),base=Math.max(now,b.data()?.paidUntilMs||0);
  paidUntilMs=base+cloudPlanCatalog[p.data().plan].periodDays*86400000;
  tx.create(receipt,{reference,orgId:org.id,projectId:p.data().projectId,
    createdAt:FieldValue.serverTimestamp()});
  tx.set(bill,{status:'paid',receiptVerified:true,plan:p.data().plan,
    paidUntilMs,amountKes:p.data().priceKes,currency:'KES',lastReference:reference,
    verifiedAt:FieldValue.serverTimestamp(),paymentProvider:'paystack',
    updatedAt:FieldValue.serverTimestamp()},{merge:true});
  tx.update(payment,{status:'paid',receiptVerified:true,verifiedAt:FieldValue.serverTimestamp(),
    providerTransactionId:decision.providerTransactionId});
 });
 return {status:'paid',verified:true,paidUntilMs};
});
export const cloudGetSubscriptionStatus=onCall({region,enforceAppCheck:true},async req=>{
 const {org}=await context(req),project=projectRef(org,req.data?.projectId);
 if(!(await project.get()).exists)throw new HttpsError('not-found','Project not found');
 const bill=(await billingRef(org,project.id).get()).data();
 return {paid:isCloudServicePaid(bill),paidUntilMs:bill?.paidUntilMs||null,
  plan:bill?.plan||null,status:bill?.status||'unpaid',
  currency:'KES',plans:cloudPlanCatalog,cloudProviderFeesIncluded:false,
  note:'Service charge only; provider usage is separately billed. M-Pesa renewals require manual payment.'};
});
