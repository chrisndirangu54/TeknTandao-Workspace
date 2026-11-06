// Authenticated collector ingestion. Accounting is advisory until RADIUS reconciliation.
import {randomUUID} from 'node:crypto';
import {getFirestore,FieldValue} from 'firebase-admin/firestore';
import {onRequest} from 'firebase-functions/v2/https';
import {defineSecret} from 'firebase-functions/params';
import {normalizeRadiusAccounting,verifyCollectorSignature} from './hotspot_domain.js';
const collectorKey=defineSecret('HOTSPOT_COLLECTOR_HMAC_KEY');
export const hotspotAccountingIngest=onRequest({region:'europe-west1',secrets:[collectorKey],invoker:'public',maxInstances:5,timeoutSeconds:15},async(req,res)=>{
 res.set('Cache-Control','no-store');
 if(req.method!=='POST'){res.status(405).send('Method not allowed');return;}
 const raw=req.rawBody;
 if(!Buffer.isBuffer(raw)||raw.length>8192){res.status(413).send('Invalid body');return;}
 const sig=req.get('x-hotspot-signature')||'';
 if(!verifyCollectorSignature(raw.toString('utf8'),sig,collectorKey.value())){res.status(401).send('Unauthorized');return;}
 let item;
 try{item=normalizeRadiusAccounting(JSON.parse(raw.toString('utf8')));}catch{res.status(400).send('Invalid event');return;}
 try{
 const store=getFirestore();const ref=store.collection('hotspotAccountingEvents').doc(item.eventId);
 const audit=store.collection('hotspotAudit').doc(randomUUID());
 const replay=await store.runTransaction(async tx=>{
   const prev=await tx.get(ref);if(prev.exists)return true;
   // The collector must be registered for the stated site. Does not trust event-supplied tenant data.
   const site=await tx.get(store.collection('hotspotSites').doc(item.siteId));
   if(!site.exists||site.data().status!=='active'||site.data().collectorNasId!==item.nasId)throw new Error('Unregistered NAS');
   tx.create(ref,{...item,verified:true,createdAt:FieldValue.serverTimestamp()});
   tx.create(audit,{actor:'radius_collector',action:'accounting:'+item.type,resource:'accounting',resourceId:item.eventId,at:FieldValue.serverTimestamp()});
   return false;
 });
 res.status(replay?200:201).json({accepted:true,duplicate:replay});
 }catch{res.status(403).json({accepted:false});}
});
