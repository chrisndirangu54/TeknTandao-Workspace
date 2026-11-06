// Google Ad Manager rewarded bundle orchestration. Browser reward events are
// informational ONLY. Verified server-side evidence is required for Wi-Fi.
// A trusted separately deployed verifier must authenticate Google's web SSV
// before POSTing its assertions with this service's private HMAC key.
import {randomUUID,randomBytes,createHmac,timingSafeEqual,createHash} from 'node:crypto';
import {onCall,onRequest,HttpsError} from 'firebase-functions/v2/https';
import {defineSecret} from 'firebase-functions/params';
import {getFirestore,FieldValue} from 'firebase-admin/firestore';
import {validateGoogleBundle} from './hotspot_advertising_domain.js';
const verifierKey=defineSecret('HOTSPOT_GOOGLE_REWARD_VERIFIER_KEY');
const root=x=>getFirestore().collection('organizations').doc(x).collection('hotspotV2').doc('control');
const id=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{5,100}$/.test(x);
const fail=(c,m)=>{throw new HttpsError(c,m);};
const valid=(o,fields)=>o&&typeof o==='object'&&!Array.isArray(o)&&Object.keys(o).every(k=>fields.includes(k));
const auth=fn=>onCall({region:'europe-west1',timeoutSeconds:40,enforceAppCheck:true},fn);
const hash=x=>createHash('sha256').update(x).digest('hex');
export const hotspotV2StartGoogleBundle=auth(async req=>{
 if(!req.auth||!valid(req.data,['orgId','siteId','planId','requiredAds','consent'])||
 ![req.data.orgId,req.data.siteId,req.data.planId].every(id)||req.data.consent!==true)
 fail('invalid-argument','Consent and valid location required');
 const {orgId,siteId,planId,requiredAds}=req.data;
 if(![3,4,5].includes(requiredAds))fail('invalid-argument','Choose three to five ads');
 const space=root(orgId);
 const [site,plan]=await Promise.all([space.collection('sites').doc(siteId).get(),
   space.collection('plans').doc(planId).get()]);
 if(!site.exists||!plan.exists||site.data().gatewayVerified!==true||
   site.data().radiusEnabled!==true||site.data().labOnly!==true||
   plan.data().siteId!==site.id||plan.data().state!=='published'||
   !validateGoogleBundle({requiredAds,minutes:plan.data().durationMinutes,
      downloadMbps:plan.data().downloadMbps,maxDevices:plan.data().maxDevices}).ok||
   plan.data().priceKes!==0)fail('failed-precondition','Approved 30-minute Google lab plan required');
 const bundle=space.collection('googleRewardBundles').doc(randomUUID());
 const expiresAtMs=Date.now()+20*60000;
 await bundle.create({uidHash:hash(req.auth.uid),siteId,planId,requiredAds,
  verifiedRewards:0,status:'collecting',createdAt:FieldValue.serverTimestamp(),
  expiresAtMs,expiresAt:new Date(expiresAtMs),claimed:false});
 return {bundleId:bundle.id,requiredAds,verifiedRewards:0,expiresAtMs,
   googleAdUnitConfiguredExternally:true,googleSsvVerifierRequired:true};
});
export const hotspotV2GoogleBundleStatus=auth(async req=>{
 if(!req.auth||!valid(req.data,['orgId','bundleId'])||!
 [req.data.orgId,req.data.bundleId].every(id))fail('invalid-argument','Invalid bundle');
 const doc=await root(req.data.orgId).collection('googleRewardBundles').doc(req.data.bundleId).get();
 if(!doc.exists||doc.data().uidHash!==hash(req.auth.uid))fail('permission-denied','Bundle not yours');
 return {bundleId:doc.id,requiredAds:doc.data().requiredAds,
  verifiedRewards:doc.data().verifiedRewards||0,status:doc.data().status,
  ready:doc.data().status==='ready',expiresAtMs:doc.data().expiresAtMs};
});
// This is NOT a raw Google SSV callback. The trusted verifier must separately
// implement and test the officially supported Google web SSV validation.
export const hotspotV2VerifiedRewardIntake=onRequest({region:'europe-west1',
 secrets:[verifierKey],timeoutSeconds:20,maxInstances:5,invoker:'public'},async(req,res)=>{
 res.set('Cache-Control','no-store');
 if(req.method!=='POST'||!Buffer.isBuffer(req.rawBody)||req.rawBody.length>2048){res.status(405).end();return;}
 const timestamp=req.get('x-verified-at')||'';
 const signature=req.get('x-verifier-signature')||'';
 const key=verifierKey.value();
 if(!/^\d{13}$/.test(timestamp)||Math.abs(Date.now()-Number(timestamp))>60000||
 typeof key!=='string'||key.length<32||!/^[a-f0-9]{64}$/.test(signature)){res.status(401).end();return;}
 const expected=createHmac('sha256',key).update(timestamp).update('.').update(req.rawBody).digest('hex');
 if(!timingSafeEqual(Buffer.from(expected,'hex'),Buffer.from(signature,'hex'))){res.status(401).end();return;}
 let d;try{d=JSON.parse(req.rawBody.toString('utf8'));}catch{res.status(400).end();return;}
 if(!valid(d,['orgId','bundleId','transactionId','source','adUnit'])||
 ![d.orgId,d.bundleId,d.transactionId].every(id)||d.source!=='google_web_ssv_verified'||
 typeof d.adUnit!=='string'||d.adUnit.length>200){res.status(400).end();return;}
 const space=root(d.orgId),bundle=space.collection('googleRewardBundles').doc(d.bundleId);
 const unique=getFirestore().collection('hotspotGoogleVerifiedTransactions').doc(hash(d.transactionId));
 try{
  await getFirestore().runTransaction(async tx=>{
   const [b,duplicate]=await Promise.all([tx.get(bundle),tx.get(unique)]);
   if(!b.exists||duplicate.exists||b.data().status!=='collecting'||
    b.data().expiresAtMs<Date.now()||b.data().verifiedRewards>=b.data().requiredAds)
    throw new Error('Unknown, duplicate or completed reward');
   const count=b.data().verifiedRewards+1;
   tx.create(unique,{orgId:d.orgId,bundleId:d.bundleId,
      verificationSource:'trusted_external_ssv_verifier',createdAt:FieldValue.serverTimestamp()});
   tx.update(bundle,{verifiedRewards:count,status:count>=b.data().requiredAds?'ready':'collecting',
      lastVerifiedAt:FieldValue.serverTimestamp()});
  });
  res.status(200).json({accepted:true});
 }catch{res.status(409).json({accepted:false});}
});
export const hotspotV2ClaimGoogleBundle=auth(async req=>{
 if(!req.auth||!valid(req.data,['orgId','bundleId'])||
 ![req.data.orgId,req.data.bundleId].every(id))fail('invalid-argument','Invalid bundle');
 const space=root(req.data.orgId),bundle=space.collection('googleRewardBundles').doc(req.data.bundleId);
 const voucher=space.collection('vouchers').doc(randomUUID());
 const code=randomBytes(16).toString('hex').toUpperCase();
 const salt=randomBytes(16).toString('hex');let expiresAtMs;
 await getFirestore().runTransaction(async tx=>{
  const b=await tx.get(bundle);
  if(!b.exists||b.data().uidHash!==hash(req.auth.uid)||b.data().claimed||
   b.data().status!=='ready'||b.data().verifiedRewards!==b.data().requiredAds||
   b.data().expiresAtMs<Date.now())fail('failed-precondition','Verified Google reward bundle not complete');
  const [site,plan]=await Promise.all([tx.get(space.collection('sites').doc(b.data().siteId)),
    tx.get(space.collection('plans').doc(b.data().planId))]);
  if(!site.exists||!plan.exists||site.data().gatewayVerified!==true||
   site.data().labOnly!==true||site.data().radiusEnabled!==true||plan.data().state!=='published'||
   plan.data().siteId!==site.id||plan.data().priceKes!==0||
   !validateGoogleBundle({requiredAds:b.data().requiredAds,minutes:plan.data().durationMinutes,
     downloadMbps:plan.data().downloadMbps,maxDevices:plan.data().maxDevices}).ok)
   fail('failed-precondition','Google bundle plan no longer eligible');
  expiresAtMs=Date.now()+30*60000;
  tx.create(voucher,{siteId:site.id,planId:plan.id,state:'provisioned',gatewayProvisioned:true,
    redeemed:false,labOnly:true,accessMethod:'google_rewarded_verified',
    secretSalt:salt,secretHash:createHmac('sha256',Buffer.from(salt,'hex')).update(code).digest('hex'),
    codeLast4:code.slice(-4),expiresAtMs,createdAt:FieldValue.serverTimestamp()});
  tx.update(bundle,{claimed:true,status:'claimed',voucherId:voucher.id,claimedAt:FieldValue.serverTimestamp()});
 });
 return {voucherId:voucher.id,oneTimeCode:code,expiresAtMs,labOnly:true,routerConnected:false};
});
