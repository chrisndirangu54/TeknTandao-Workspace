// Signed Paystack TEST webhook. Verifies the provider signature and independently
// re-queries the transaction before issuing any voucher record.
import {getFirestore} from 'firebase-admin/firestore';
import {onRequest} from 'firebase-functions/v2/https';
import {defineSecret} from 'firebase-functions/params';
import {verifyPaystack} from './providers.js';
import {reconcilePaystackTestOrder} from './hotspot_v2_paystack_mpesa.js';
const key=defineSecret('HOTSPOT_PAYSTACK_TEST_SECRET');
export const hotspotV2PaystackTestWebhook=onRequest({
 region:'europe-west1',secrets:[key],timeoutSeconds:60,maxInstances:6,invoker:'public'
},async(req,res)=>{
 res.set('Cache-Control','no-store');
 if(req.method!=='POST'){res.status(405).end();return;}
 const raw=req.rawBody;
 const secret=key.value(),signature=req.get('x-paystack-signature')||'';
 if(!Buffer.isBuffer(raw)||raw.length>32768||typeof secret!=='string'||
    !secret.startsWith('sk_test_')||!verifyPaystack(raw,signature,secret)){
   res.status(401).end();return;
 }
 let body;try{body=JSON.parse(raw.toString('utf8'));}catch{res.status(400).end();return;}
 if(body?.event!=='charge.success'){res.status(200).json({received:true,ignored:true});return;}
 const reference=body?.data?.reference;
 if(typeof reference!=='string'||!/^HS[a-f0-9]{24}$/.test(reference)){
  res.status(200).json({received:true,ignored:true});return;
 }
 try{
  const link=await getFirestore().collection('hotspotPaystackReferences').doc(reference).get();
  if(!link.exists){res.status(200).json({received:true,matched:false});return;}
  const {orgId,voucherId}=link.data();
  if(typeof orgId!=='string'||typeof voucherId!=='string'){
   res.status(500).end();return;
  }
  // Webhook body is trigger only. The actual authorization source is Paystack's
  // test-key authenticated GET /transaction/verify/{reference}.
  const out=await reconcilePaystackTestOrder({orgId,voucherId,actorLabel:'verified_paystack_webhook'});
  res.status(out.verified?200:202).json({received:true,verified:out.verified===true});
 }catch{
  // Retryable failures preserve fail-closed payment state.
  res.status(503).end();
 }
});
