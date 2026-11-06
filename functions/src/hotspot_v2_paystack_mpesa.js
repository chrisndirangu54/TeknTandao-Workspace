// Tenant-scoped Paystack M-Pesa TEST mode: actual provider verification before voucher issuance.
// No sk_live keys accepted. No network commands; vouchers remain pending independent RADIUS approval.
import {randomBytes,createHash,randomUUID} from 'node:crypto';
import {getFirestore,FieldValue} from 'firebase-admin/firestore';
import {onCall,HttpsError} from 'firebase-functions/v2/https';
import {defineSecret} from 'firebase-functions/params';
import {verifyTransaction} from './providers.js';
import {validatePaystackMpesaResult} from './hotspot_paystack_domain.js';
const paystackSecret=defineSecret('HOTSPOT_PAYSTACK_TEST_SECRET');
const fail=(code,msg)=>{throw new HttpsError(code,msg);};
const valid=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{5,100}$/.test(x);
const only=(obj,fields)=>{if(!obj||typeof obj!=='object'||Array.isArray(obj)||Object.keys(obj).some(k=>!fields.includes(k)))fail('invalid-argument','Unexpected input');};
const fn=work=>onCall({region:'europe-west1',timeoutSeconds:60,secrets:[paystackSecret]},work);
const secret=()=>{const s=paystackSecret.value();if(typeof s!=='string'||!s.startsWith('sk_test_'))fail('failed-precondition','Paystack test key not configured');return s;};
const db=()=>getFirestore(),root=org=>db().collection('organizations').doc(org).collection('hotspotV2').doc('control');
async function actor(req){
 if(!req.auth)fail('unauthenticated','Sign in required');
 if(!valid(req.data?.orgId))fail('invalid-argument','Invalid organization');
 const m=await db().collection('organizations').doc(req.data.orgId).collection('members').doc(req.auth.uid).get();
 if(!m.exists||!['owner','admin'].includes(m.data()?.role))fail('permission-denied','Workspace admin required');
 return {uid:req.auth.uid,root:root(req.data.orgId)};
}
export const hotspotV2StartPaystackMpesaTest=fn(async req=>{
 only(req.data,['orgId','voucherId','email','phone']);
 const {uid,root:space}=await actor(req);
 const voucherId=req.data.voucherId;
 const email=typeof req.data.email==='string'?req.data.email.trim().toLowerCase():'';
 const phone=req.data.phone;
 if(!valid(voucherId)||!/^[^@\s]{1,64}@[^@\s]{1,100}\.[^@\s]{2,30}$/.test(email)||
 typeof phone!=='string'||!/^254[17][0-9]{8}$/.test(phone))
 fail('invalid-argument','Invalid voucher, email or phone');
 const key=secret(),reference='HS'+randomBytes(12).toString('hex');
 const payment=space.collection('paymentIntents').doc(voucherId);
 let price=0;
 await db().runTransaction(async tx=>{
  const voucher=await tx.get(space.collection('vouchers').doc(voucherId));
  const exists=await tx.get(payment);
  if(exists.exists)fail('already-exists','Checkout already exists. Verify status; do not retry blindly');
  if(!voucher.exists||voucher.data().state!=='pending_payment')fail('failed-precondition','Paid voucher must be prepared');
  const [site,plan]=await Promise.all([tx.get(space.collection('sites').doc(voucher.data().siteId)),
    tx.get(space.collection('plans').doc(voucher.data().planId))]);
  if(!site.exists||site.data().state!=='commissioned'||!plan.exists||
    plan.data().siteId!==site.id||plan.data().state!=='published'||
    !Number.isSafeInteger(plan.data().priceKes)||plan.data().priceKes<1||plan.data().priceKes>1000000)
    fail('failed-precondition','Published paid plan required');
  price=plan.data().priceKes;
  tx.create(payment,{id:voucherId,voucherId,siteId:site.id,planId:plan.id,
    reference,provider:'paystack_mpesa_test',state:'initiating',amountKes:price,
    receiptVerified:false,customerEmailHash:createHash('sha256').update(email).digest('hex'),
    phoneLast4:phone.slice(-4),requestedBy:uid,createdAt:FieldValue.serverTimestamp()});
 });
 try{
  const response=await fetch('https://api.paystack.co/charge',{
   method:'POST',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},
   body:JSON.stringify({email,amount:price*100,currency:'KES',reference,
    mobile_money:{phone:'+'+phone,provider:'mpesa'}}),signal:AbortSignal.timeout(20000)});
  if(!response.ok)throw new Error('Provider unavailable');
  const body=await response.json();
  if(body.status!==true||body.data?.reference!==reference)throw new Error('Provider request not confirmed');
  await payment.update({state:'pending_verification',
    paymentInstruction:String(body.data.display_text||'Complete M-Pesa authorization on your phone').slice(0,300),
    updatedAt:FieldValue.serverTimestamp()});
  return {ok:true,reference,environment:'paystack_test',status:'pending_verification',
    paymentInstruction:body.data.display_text||'Complete M-Pesa authorization on your phone',
    internetActivated:false};
 }catch{
  await payment.update({state:'initiation_unknown',updatedAt:FieldValue.serverTimestamp()});
  fail('unavailable','Charge initiation state unknown; check provider by reference before retrying');
 }
});
export const hotspotV2VerifyPaystackMpesaTest=fn(async req=>{
 only(req.data,['orgId','voucherId']);
 const {uid,root:space}=await actor(req);
 const voucherId=req.data.voucherId;if(!valid(voucherId))fail('invalid-argument','Invalid voucher');
 const payment=space.collection('paymentIntents').doc(voucherId);
 const snapshot=await payment.get();
 if(!snapshot.exists||snapshot.data().provider!=='paystack_mpesa_test')
  fail('failed-precondition','No Paystack M-Pesa checkout for this voucher');
 if(snapshot.data().state==='verified')return {verified:true,alreadyVerified:true,networkActivated:false};
 if(!['pending_verification','initiation_unknown'].includes(snapshot.data().state))
  fail('failed-precondition','Order cannot be verified in its current state');
 let result;
 try{result=await verifyTransaction(secret(),snapshot.data().reference);}
 catch{fail('unavailable','Provider verification unavailable');}
 const decision=validatePaystackMpesaResult({order:snapshot.data(),result});
 if(!decision.verified)return {verified:false,reason:decision.reason,networkActivated:false};
 const receipt=db().collection('hotspotPaystackReceipts').doc(decision.paymentId);
 const voucher=space.collection('vouchers').doc(voucherId);
 const audit=space.collection('audit').doc(randomUUID());
 await db().runTransaction(async tx=>{
  const [p,v,prior]=await Promise.all([tx.get(payment),tx.get(voucher),tx.get(receipt)]);
  if(!p.exists||p.data().reference!==decision.reference||
     !['pending_verification','initiation_unknown'].includes(p.data().state))
     fail('aborted','Payment state changed');
  if(!v.exists||v.data().state!=='pending_payment')fail('failed-precondition','Voucher no longer pending');
  const [plan,site]=await Promise.all([tx.get(space.collection('plans').doc(v.data().planId)),
   tx.get(space.collection('sites').doc(v.data().siteId))]);
  if(!plan.exists||!site.exists||site.data().state!=='commissioned'||
    plan.data().state!=='published'||plan.data().siteId!==site.id||
    v.data().planId!==p.data().planId||v.data().siteId!==p.data().siteId||
    plan.data().priceKes!==decision.amountKes)
    fail('failed-precondition','Payment plan mismatch');
  if(prior.exists)fail('already-exists','Provider transaction already claimed');
  tx.create(receipt,{provider:'paystack',test:true,reference:decision.reference,
    orgId:req.data.orgId,voucherId,createdAt:FieldValue.serverTimestamp()});
  tx.update(payment,{state:'verified',receiptVerified:true,providerVerifiedAt:FieldValue.serverTimestamp(),
    paidAt:decision.paidAt,paymentId:decision.paymentId,updatedAt:FieldValue.serverTimestamp()});
  tx.update(voucher,{state:'issued',paymentVerified:true,paymentProvider:'paystack_mpesa_test',
    paidAt:FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp()});
  tx.create(audit,{actor:uid,action:'provider_verified_test_payment',resource:voucherId,
    createdAt:FieldValue.serverTimestamp()});
 });
 return {verified:true,voucherState:'issued',environment:'paystack_test',networkActivated:false};
});
