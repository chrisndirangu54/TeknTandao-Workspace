// Tenant-scoped signed accounting ingestion for the private FreeRADIUS bridge.
// Does not trust a browser or claim independent NAS attestation.
import {createHash,randomUUID} from 'node:crypto';
import {getFirestore,FieldValue} from 'firebase-admin/firestore';
import {onRequest} from 'firebase-functions/v2/https';
import {verifySignedRadiusRequest} from './hotspot_radius_authorization_domain.js';
import {normalizeV2Session} from './hotspot_session_domain.js';
export const hotspotV2RadiusAccounting=onRequest({
 region:'europe-west1',invoker:'public',timeoutSeconds:12,maxInstances:10
},async(req,res)=>{
 res.set('Cache-Control','no-store');
 if(req.method!=='POST'){res.status(405).end();return;}
 let entry;try{entry=normalizeV2Session(JSON.parse(req.rawBody.toString('utf8')));}
 catch{res.status(400).end();return;}
 const root=getFirestore().collection('organizations').doc(entry.orgId).collection('hotspotV2').doc('control');
 const credential=await root.collection('gatewaySecrets').doc(entry.siteId).get();
 if(!credential.exists||credential.data().enabled!==true||
 !verifySignedRadiusRequest({raw:req.rawBody,timestamp:req.get('x-hotspot-timestamp'),
   signature:req.get('x-hotspot-signature'),secret:credential.data().secret})){
   res.status(401).end();return;
 }
 const nonce=root.collection('radiusNonces').doc(entry.nonce);
 const event=root.collection('accountingEvents').doc(entry.eventId);
 const session=root.collection('gatewaySessions').doc(createHash('sha256').update(
  entry.siteId+'|'+entry.voucherId+'|'+entry.sessionId).digest('hex'));
 try{
  let outcome='new';
  await getFirestore().runTransaction(async tx=>{
   const [n,previous,site,voucher,active]=await Promise.all([
    tx.get(nonce),tx.get(event),tx.get(root.collection('sites').doc(entry.siteId)),
    tx.get(root.collection('vouchers').doc(entry.voucherId)),tx.get(session)]);
   if(n.exists){outcome='replay';return;}
   if(!site.exists||site.data().nasId!==entry.nasId||
    site.data().state!=='commissioned'||!voucher.exists||
    voucher.data().siteId!==entry.siteId)throw new Error('Unregistered or mismatched NAS');
   if(previous.exists){outcome='duplicate';return;}
   if(active.exists&&active.data().observedAtMs>entry.observedAtMs){outcome='stale';return;}
   tx.create(nonce,{expiresAt:new Date(Date.now()+5*60000),createdAt:FieldValue.serverTimestamp()});
   tx.create(event,{...entry,createdAt:FieldValue.serverTimestamp()});
   tx.set(session,{siteId:entry.siteId,voucherId:entry.voucherId,nasId:entry.nasId,
    sessionId:entry.sessionId,state:entry.type==='stop'?'stopped':'open',
    observedAtMs:entry.observedAtMs,inputOctets:entry.inputOctets,outputOctets:entry.outputOctets,
    source:'signed_radius_bridge',updatedAt:FieldValue.serverTimestamp()},{merge:true});
  });
  res.status(outcome==='new'?201:outcome==='replay'?409:200).json({outcome});
 }catch{res.status(403).json({accepted:false});}
});
