// Safaricom STK callback evidence intake. Callbacks are NOT cryptographically
// authenticated by Safaricom; never treat the data as payment settlement.
import {createHash,timingSafeEqual,randomUUID} from 'node:crypto';
import {getFirestore,FieldValue} from 'firebase-admin/firestore';
import {onRequest} from 'firebase-functions/v2/https';
import {parseStkCallback} from './hotspot_settlement_domain.js';
const valid=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{5,100}$/.test(x);
export const hotspotV2MpesaCallback=onRequest({region:'europe-west1',timeoutSeconds:15,maxInstances:5,invoker:'public'},async(req,res)=>{
 res.set('Cache-Control','no-store');
 if(req.method!=='POST'){res.status(405).end();return;}
 const {orgId,voucherId,token}=req.query;
 if(!valid(orgId)||!valid(voucherId)||typeof token!=='string'||!/^[a-f0-9]{48}$/.test(token)||
 !Buffer.isBuffer(req.rawBody)||req.rawBody.length>8192){res.status(400).end();return;}
 let evidence;
 try{evidence=parseStkCallback(JSON.parse(req.rawBody.toString('utf8')));}catch{res.status(400).end();return;}
 if(!evidence.valid){res.status(400).end();return;}
 const store=getFirestore();
 const root=store.collection('organizations').doc(orgId).collection('hotspotV2').doc('control');
 const ref=root.collection('paymentIntents').doc(voucherId);
 try{
  const first=await ref.get();
  if(!first.exists||typeof first.data().callbackTokenHash!=='string'||!/^[a-f0-9]{64}$/.test(first.data().callbackTokenHash)){
   res.status(404).end();return;
  }
  const hash=createHash('sha256').update(token).digest();
  if(!timingSafeEqual(hash,Buffer.from(first.data().callbackTokenHash,'hex'))){res.status(403).end();return;}
  if(first.data().checkoutRequestId!==evidence.checkoutId){res.status(409).end();return;}
  await store.runTransaction(async tx=>{
   const current=await tx.get(ref);
   if(!current.exists||current.data().checkoutRequestId!==evidence.checkoutId||
      current.data().callbackTokenHash!==first.data().callbackTokenHash)
    throw new Error('Stale checkout');
   const existing=current.data().callbackEvidence;
   if(existing&&existing.checkoutId===evidence.checkoutId){
    if(existing.receipt!==evidence.receipt||existing.amountKes!==evidence.amountKes||existing.resultCode!==evidence.resultCode)
      throw new Error('Conflicting callback');
    return;
   }
   tx.update(ref,{callbackEvidence:{
     checkoutId:evidence.checkoutId,resultCode:evidence.resultCode,
     receipt:evidence.receipt,amountKes:evidence.amountKes,
     phoneLast4:evidence.phoneLast4,trusted:false,
     observedAt:FieldValue.serverTimestamp()},
     receiptVerified:false,updatedAt:FieldValue.serverTimestamp()});
   tx.create(root.collection('audit').doc(randomUUID()),{
     action:'untrusted_stk_callback_received',resource:voucherId,
     actor:'safaricom_callback_claim',at:FieldValue.serverTimestamp()});
  });
  res.status(200).json({ResultCode:0,ResultDesc:'Callback evidence received'});
 }catch{res.status(409).end();}
});
