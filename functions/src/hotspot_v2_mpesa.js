// Hotspot v2 M-Pesa sandbox adapter. Does not enable live charges or grant Wi-Fi.
import {randomUUID,randomBytes,createHash} from 'node:crypto';
import {getFirestore,FieldValue} from 'firebase-admin/firestore';
import {onCall,HttpsError} from 'firebase-functions/v2/https';
import {defineSecret} from 'firebase-functions/params';
import {initiateMpesa,queryMpesa} from './providers.js';
const apiKey=defineSecret('HOTSPOT_MPESA_KEY');
const apiSecret=defineSecret('HOTSPOT_MPESA_SECRET');
const shortcode=defineSecret('HOTSPOT_MPESA_SHORTCODE');
const passkey=defineSecret('HOTSPOT_MPESA_PASSKEY');
const callbackUrl=defineSecret('HOTSPOT_MPESA_CALLBACK_URL');
const secrets=[apiKey,apiSecret,shortcode,passkey,callbackUrl];
const fail=(code,message)=>{throw new HttpsError(code,message);};
const valid=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{5,100}$/.test(x);
const config=()=>({key:apiKey.value(),secret:apiSecret.value(),shortcode:shortcode.value(),
 passkey:passkey.value(),callbackUrl:callbackUrl.value(),live:false});
const root=org=>getFirestore().collection('organizations').doc(org).collection('hotspotV2').doc('control');
const run=fn=>onCall({region:'europe-west1',secrets,timeoutSeconds:60},fn);
async function authorize(req){
 if(!req.auth)fail('unauthenticated','Sign-in required');
 if(!valid(req.data?.orgId))fail('invalid-argument','Invalid organization');
 const ref=getFirestore().collection('organizations').doc(req.data.orgId).collection('members').doc(req.auth.uid);
 const member=await ref.get();
 if(!member.exists||!['owner','admin'].includes(member.data()?.role))fail('permission-denied','Owner/admin only');
 return root(req.data.orgId);
}
export const hotspotV2StartSandboxMpesa=run(async req=>{
 if(!req.data||Object.keys(req.data).some(k=>!['orgId','voucherId','phone'].includes(k)))
  fail('invalid-argument','Unexpected fields');
 const workspace=await authorize(req),voucherId=req.data.voucherId,phone=req.data.phone;
 if(!valid(voucherId)||typeof phone!=='string'||!/^254[17][0-9]{8}$/.test(phone))
  fail('invalid-argument','Invalid voucher or phone');
 const order=workspace.collection('paymentIntents').doc(voucherId);
 const token=randomBytes(24).toString('hex');
 let price;
 await getFirestore().runTransaction(async tx=>{
  const voucher=await tx.get(workspace.collection('vouchers').doc(voucherId));
  const existing=await tx.get(order);
  if(existing.exists)fail('already-exists','Payment intent already reserved; reconcile before retrying');
  if(!voucher.exists||voucher.data().state!=='pending_payment')fail('failed-precondition','Voucher not awaiting payment');
  const site=await tx.get(workspace.collection('sites').doc(voucher.data().siteId));
  const plan=await tx.get(workspace.collection('plans').doc(voucher.data().planId));
  if(!site.exists||site.data().state!=='commissioned'||!plan.exists||
      plan.data().state!=='published'||plan.data().siteId!==site.id||
      !Number.isSafeInteger(plan.data().priceKes)||plan.data().priceKes<1)
    fail('failed-precondition','Site or priced plan invalid');
  price=plan.data().priceKes;
  tx.create(order,{voucherId,siteId:site.id,planId:plan.id,amountKes:price,
    state:'initiating',provider:'safaricom_sandbox',phoneLast4:phone.slice(-4),
    receiptVerified:false,callbackTokenHash:createHash('sha256').update(token).digest('hex'),
    createdAt:FieldValue.serverTimestamp()});
 });
 try{
  const paymentConfig=config();
  const url=new URL(paymentConfig.callbackUrl);
  url.searchParams.set('orgId',req.data.orgId);
  url.searchParams.set('voucherId',voucherId);
  url.searchParams.set('token',token);
  paymentConfig.callbackUrl=url.toString();
  const response=await initiateMpesa(paymentConfig,{phone,amount:price,reference:voucherId.slice(0,12),description:'Wi-Fi sandbox pilot'});
  if(!response.CheckoutRequestID)throw new Error('No checkout reference');
  await order.update({state:'pending_verification',checkoutRequestId:response.CheckoutRequestID,
   merchantRequestId:response.MerchantRequestID||null,updatedAt:FieldValue.serverTimestamp()});
  return {ok:true,checkoutRequestId:response.CheckoutRequestID,environment:'sandbox',
   receiptVerified:false,networkActivated:false};
 }catch{
  await order.update({state:'initiation_unknown',updatedAt:FieldValue.serverTimestamp()});
  fail('unavailable','Provider request status unknown; manual reconciliation required before retrying');
 }
});
export const hotspotV2QuerySandboxMpesa=run(async req=>{
 if(!req.data||Object.keys(req.data).some(k=>!['orgId','voucherId'].includes(k)))
  fail('invalid-argument','Unexpected fields');
 const workspace=await authorize(req);
 if(!valid(req.data.voucherId))fail('invalid-argument','Invalid voucher');
 const doc=workspace.collection('paymentIntents').doc(req.data.voucherId);
 const existing=await doc.get();
 if(!existing.exists||existing.data().provider!=='safaricom_sandbox'||!existing.data().checkoutRequestId)
  fail('failed-precondition','No checkout to query');
 let result;
 try{result=await queryMpesa(config(),existing.data().checkoutRequestId);}
 catch{fail('unavailable','Provider query unavailable');}
 const providerCode=String(result.ResultCode??'unknown').slice(0,32);
 await getFirestore().runTransaction(async tx=>{
  const current=await tx.get(doc);
  if(!current.exists||current.data().checkoutRequestId!==existing.data().checkoutRequestId)
   fail('aborted','Checkout changed');
  // Query result alone cannot prove amount, receipt, paybill ownership or unique settlement.
  tx.update(doc,{providerQueryCode:providerCode,
    state:providerCode==='0'?'provider_success_unreconciled':'provider_pending_or_failed',
    receiptVerified:false,lastQueryAt:FieldValue.serverTimestamp()});
  tx.create(workspace.collection('audit').doc(randomUUID()),{
    actor:req.auth.uid,action:'sandbox_payment_query',resource:doc.id,at:FieldValue.serverTimestamp()});
 });
 return {providerQueryCode:providerCode,receiptVerified:false,networkActivated:false,
  note:'Success is not settled until verified receipt, amount, merchant and duplicate checks pass.'};
});
