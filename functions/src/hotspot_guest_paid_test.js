// Guest-facing Paystack TEST-mode checkout for previously commissioned lab sites.
// Never accepts live keys, never charges production money, never bypasses provider
// verification. Requires Firebase Auth + App Check; no customer PIN collection.
import {randomUUID,randomBytes,createHash,createHmac} from 'node:crypto';
import {getFirestore,FieldValue} from 'firebase-admin/firestore';
import {onCall,HttpsError} from 'firebase-functions/v2/https';
import {defineSecret} from 'firebase-functions/params';
const secretParam=defineSecret('HOTSPOT_PAYSTACK_TEST_SECRET');
const fail=(code,msg)=>{throw new HttpsError(code,msg);};
const valid=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{5,100}$/.test(x);
const check=(x,keys)=>{if(!x||typeof x!=='object'||Array.isArray(x)||Object.keys(x).some(k=>!keys.includes(k)))fail('invalid-argument','Unexpected request');};
const db=()=>getFirestore(),space=org=>db().collection('organizations').doc(org).collection('hotspotV2').doc('control');
const run=fn=>onCall({region:'europe-west1',timeoutSeconds:60,enforceAppCheck:true,secrets:[secretParam]},fn);
const secret=()=>{const s=secretParam.value();if(typeof s!=='string'||!s.startsWith('sk_test_'))fail('failed-precondition','Test gateway not configured');return s;};
const uidHash=uid=>createHash('sha256').update(uid).digest('hex');

export const hotspotV2BeginGuestPaidTest=run(async req=>{
 check(req.data,['orgId','siteId','planId','email','phone','consent']);
 if(!req.auth||req.data.consent!==true)fail('unauthenticated','Sign-in and explicit test checkout consent required');
 const {orgId,siteId,planId}=req.data;
 const email=typeof req.data.email==='string'?req.data.email.trim().toLowerCase():'';
 const phone=req.data.phone;
 if(![orgId,siteId,planId].every(valid)||!/^[^@\s]{1,64}@[^@\s]{1,100}\.[^@\s]{2,30}$/.test(email)||
   typeof phone!=='string'||!/^254[17]\d{8}$/.test(phone))fail('invalid-argument','Invalid checkout');
 const key=secret(),root=space(orgId);
 const id=randomUUID(),reference='HS'+randomBytes(12).toString('hex');
 const voucher=root.collection('vouchers').doc(id);
 const order=root.collection('paymentIntents').doc(id);
 const refIndex=db().collection('hotspotPaystackReferences').doc(reference);
 const date=new Date().toISOString().slice(0,10);
 const cap=root.collection('guestPaymentAttempts').doc(date+'_'+uidHash(req.auth.uid));
 let amountKes=null;
 await db().runTransaction(async tx=>{
  const [site,plan,oldRef,attempts]=await Promise.all([
    tx.get(root.collection('sites').doc(siteId)),tx.get(root.collection('plans').doc(planId)),
    tx.get(refIndex),tx.get(cap)]);
  if(oldRef.exists||!site.exists||!plan.exists||site.data().state!=='commissioned'||
    site.data().labOnly!==true||site.data().gatewayVerified!==true||site.data().radiusEnabled!==true||
    plan.data().siteId!==site.id||plan.data().state!=='published'||
    !Number.isSafeInteger(plan.data().priceKes)||plan.data().priceKes<1||
    plan.data().priceKes>1000||!Number.isSafeInteger(plan.data().durationMinutes)||
    plan.data().durationMinutes>60)fail('failed-precondition','Approved low-cost test plan required');
  if(attempts.exists&&attempts.data().count>=3)fail('resource-exhausted','Daily test checkouts exceeded');
  amountKes=plan.data().priceKes;
  tx.create(voucher,{siteId,planId,state:'pending_payment',redeemed:false,
   guestUidHash:uidHash(req.auth.uid),gatewayProvisioned:false,paymentVerified:false,
   accessMethod:'paystack_test_guest',createdAt:FieldValue.serverTimestamp()});
  tx.create(order,{id,voucherId:id,siteId,planId,amountKes,
   reference,provider:'paystack_mpesa_test',state:'initiating',
   receiptVerified:false,customerEmailHash:createHash('sha256').update(email).digest('hex'),
   phoneLast4:phone.slice(-4),createdAt:FieldValue.serverTimestamp()});
  tx.create(refIndex,{orgId,voucherId:id,createdAt:FieldValue.serverTimestamp()});
  tx.set(cap,{count:FieldValue.increment(1),updatedAt:FieldValue.serverTimestamp()},{merge:true});
 });
 try{
  const response=await fetch('https://api.paystack.co/charge',{method:'POST',headers:{
    Authorization:'Bearer '+key,'Content-Type':'application/json'},
    body:JSON.stringify({email,amount:amountKes*100,currency:'KES',reference,
      mobile_money:{phone:'+'+phone,provider:'mpesa'}}),
    signal:AbortSignal.timeout(20000)});
  if(!response.ok)throw new Error('Provider call failed');
  const body=await response.json();
  if(body.status!==true||body.data?.reference!==reference)throw new Error('Invalid provider response');
  await db().runTransaction(async tx=>{
   const snapshot=await tx.get(order);
   if(snapshot.exists&&snapshot.data().state==='initiating')
    tx.update(order,{state:'pending_verification',updatedAt:FieldValue.serverTimestamp()});
  });
  return {voucherId:id,reference,environment:'test',
   instruction:String(body.data.display_text||'Complete the test M-Pesa authorization').slice(0,300),
   paymentVerified:false,internetActivated:false};
 }catch{
  await db().runTransaction(async tx=>{
   const snapshot=await tx.get(order);
   if(snapshot.exists&&snapshot.data().state==='initiating')
    tx.update(order,{state:'initiation_unknown',updatedAt:FieldValue.serverTimestamp()});
  });
  fail('unavailable','Provider status unknown. Preserve voucher ID and do not start another checkout blindly.');
 }
});

export const hotspotV2ClaimGuestPaidTest=run(async req=>{
 check(req.data,['orgId','voucherId']);
 if(!req.auth||!valid(req.data.orgId)||!valid(req.data.voucherId))
  fail('unauthenticated','Sign-in and voucher reference required');
 const root=space(req.data.orgId),id=req.data.voucherId;
 const voucher=root.collection('vouchers').doc(id),payment=root.collection('paymentIntents').doc(id);
 const oneTimeCode=randomBytes(16).toString('hex').toUpperCase();
 const salt=randomBytes(16).toString('hex');
 let expiresAtMs=null;
 await db().runTransaction(async tx=>{
  const [v,p]=await Promise.all([tx.get(voucher),tx.get(payment)]);
  if(!v.exists||v.data().guestUidHash!==uidHash(req.auth.uid)||v.data().state!=='issued'||
    v.data().guestClaimedAt||!p.exists||p.data().state!=='verified'||
    p.data().provider!=='paystack_mpesa_test'||p.data().receiptVerified!==true||
    !p.data().providerVerifiedAt||p.data().voucherId!==id||
    p.data().planId!==v.data().planId||p.data().siteId!==v.data().siteId)
    fail('failed-precondition','Verified, unclaimed customer checkout required');
  const [site,plan]=await Promise.all([
   tx.get(root.collection('sites').doc(v.data().siteId)),
   tx.get(root.collection('plans').doc(v.data().planId))]);
  if(!site.exists||!plan.exists||site.data().state!=='commissioned'||
    site.data().labOnly!==true||site.data().gatewayVerified!==true||
    site.data().radiusEnabled!==true||plan.data().state!=='published'||
    plan.data().siteId!==site.id||plan.data().priceKes!==p.data().amountKes||
    !Number.isSafeInteger(plan.data().durationMinutes)||plan.data().durationMinutes<1||
    plan.data().durationMinutes>60)fail('failed-precondition','Test gateway not eligible');
  expiresAtMs=Date.now()+plan.data().durationMinutes*60000;
  tx.update(voucher,{state:'provisioned',gatewayProvisioned:true,
    labOnly:true,expiresAtMs,secretSalt:salt,
    secretHash:createHmac('sha256',Buffer.from(salt,'hex')).update(oneTimeCode).digest('hex'),
    codeLast4:oneTimeCode.slice(-4),guestClaimedAt:FieldValue.serverTimestamp(),
    updatedAt:FieldValue.serverTimestamp()});
  tx.create(root.collection('audit').doc(randomUUID()),{
    actor:'authenticated_guest',action:'verified_test_checkout_claimed',
    target:id,at:FieldValue.serverTimestamp()});
 });
 return {voucherId:id,oneTimeCode,expiresAtMs,labOnly:true,
   networkConnected:false,paymentMode:'paystack_test'};
});

export const hotspotV2PublicGuestPlans=run(async req=>{
 check(req.data,['orgId','siteId']);
 if(!req.auth||!valid(req.data.orgId)||!valid(req.data.siteId))
  fail('unauthenticated','Sign-in and site required');
 const root=space(req.data.orgId),site=await root.collection('sites').doc(req.data.siteId).get();
 if(!site.exists||site.data().state!=='commissioned'||site.data().labOnly!==true||
  site.data().gatewayVerified!==true||site.data().radiusEnabled!==true)
  fail('not-found','No verified pilot hotspot');
 const plans=await root.collection('plans').where('siteId','==',site.id).limit(50).get();
 return {site:{id:site.id,name:site.data().name,ssid:site.data().ssid},
  plans:plans.docs.filter(p=>p.data().state==='published'&&
    Number.isSafeInteger(p.data().priceKes)&&p.data().priceKes>0&&p.data().priceKes<=1000&&
    Number.isSafeInteger(p.data().durationMinutes)&&p.data().durationMinutes<=60)
   .map(p=>({id:p.id,name:p.data().name,priceKes:p.data().priceKes,
     durationMinutes:p.data().durationMinutes,downloadMbps:p.data().downloadMbps,
     uploadMbps:p.data().uploadMbps})),environment:'paystack_test_only',productionCheckoutEnabled:false};
});
export const hotspotV2GuestPaymentStatusTest=run(async req=>{
 check(req.data,['orgId','voucherId']);
 if(!req.auth||!valid(req.data.orgId)||!valid(req.data.voucherId))
  fail('unauthenticated','Sign-in and voucher required');
 const root=space(req.data.orgId),v=await root.collection('vouchers').doc(req.data.voucherId).get();
 if(!v.exists||v.data().guestUidHash!==uidHash(req.auth.uid))
  fail('permission-denied','Voucher owner mismatch');
 const payment=await root.collection('paymentIntents').doc(v.id).get();
 return {voucherId:v.id,voucherState:v.data().state,
  providerState:payment.exists?payment.data().state:'unavailable',
  paymentVerified:payment.exists&&payment.data().receiptVerified===true,
  networkActivated:false,environment:'paystack_test'};
});
