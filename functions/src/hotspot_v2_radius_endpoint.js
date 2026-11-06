// Private RADIUS REST authorization endpoint. Explicitly rejects all uncommissioned sites.
// Expose only to a trusted RADIUS bridge protected with HMAC and replay detection.
import {getFirestore,FieldValue} from 'firebase-admin/firestore';
import {onRequest} from 'firebase-functions/v2/https';
import {defineSecret} from 'firebase-functions/params';
import {verifySignedRadiusRequest,evaluateRadiusAccess} from './hotspot_radius_authorization_domain.js';
const key=defineSecret('HOTSPOT_RADIUS_BRIDGE_HMAC_KEY');
const id=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{5,100}$/.test(x);
const allowedFields=['orgId','siteId','nasId','voucherId','code','nonce'];
export const hotspotV2RadiusAuthorize=onRequest({
 region:'europe-west1',secrets:[key],timeoutSeconds:10,maxInstances:10,invoker:'public'
},async(req,res)=>{
 res.set('Cache-Control','no-store');
 if(req.method!=='POST'){res.status(405).send('Method not allowed');return;}
 const raw=req.rawBody;
 if(!verifySignedRadiusRequest({raw,timestamp:req.get('x-hotspot-timestamp'),
   signature:req.get('x-hotspot-signature'),secret:key.value()})){res.status(401).json({accepted:false});return;}
 let input;
 try{input=JSON.parse(raw.toString('utf8'));}
 catch{res.status(400).json({accepted:false});return;}
 if(!input||typeof input!=='object'||Array.isArray(input)||
  Object.keys(input).some(k=>!allowedFields.includes(k))||
  ![input.orgId,input.siteId,input.nasId,input.voucherId,input.nonce].every(id)||
  typeof input.code!=='string'||!/^[A-Fa-f0-9]{32}$/.test(input.code)){
  res.status(400).json({accepted:false});return;
 }
 const store=getFirestore();
 const base=store.collection('organizations').doc(input.orgId).collection('hotspotV2').doc('control');
 // Atomic replay prevention: never allow the same signed request nonce twice.
 const nonceRef=base.collection('radiusNonces').doc(input.nonce);
 try{await nonceRef.create({at:FieldValue.serverTimestamp(),
   expiresAt:FieldValue.serverTimestamp()});}
 catch{res.status(409).json({accepted:false,reason:'replay'});return;}
 try{
  const [site,voucher]=await Promise.all([
   base.collection('sites').doc(input.siteId).get(),
   base.collection('vouchers').doc(input.voucherId).get()
  ]);
  if(!site.exists||!voucher.exists||site.data().nasId!==input.nasId){
   res.status(403).json({accepted:false});return;
  }
  const plan=await base.collection('plans').doc(voucher.data().planId).get();
  if(!plan.exists){res.status(403).json({accepted:false});return;}
  let payment=null;
  if(plan.data().priceKes>0){
    const p=await base.collection('paymentIntents').doc(voucher.id).get();
    if(p.exists)payment=p.data();
  }
  const decision=evaluateRadiusAccess({
    site:{id:site.id,...site.data()},voucher:{id:voucher.id,...voucher.data()},
    plan:{id:plan.id,...plan.data()},payment,providedCode:input.code
  });
  res.status(decision.authorized?200:403).json(decision.authorized?
    {accepted:true,reply:decision.attributes}:{accepted:false,reason:decision.reason});
 }catch{res.status(503).json({accepted:false,reason:'backend_unavailable'});}
});
