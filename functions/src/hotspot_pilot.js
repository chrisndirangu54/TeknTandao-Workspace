// Safe single-site pilot coordination. No payment capture, voucher redemption, or gateway commands.
import {randomUUID} from 'node:crypto';
import {getFirestore,FieldValue} from 'firebase-admin/firestore';
import {onCall,HttpsError} from 'firebase-functions/v2/https';
import {isSuperAdminToken} from './super_admin_domain.js';
import {summarizeRadiusSessions} from './hotspot_gateway_policy.js';
const db=()=>getFirestore();
const fail=(code,message)=>{throw new HttpsError(code,message);};
const id=x=>{if(typeof x!=='string'||!/^[A-Za-z0-9_-]{5,100}$/.test(x))fail('invalid-argument','Invalid reference');return x;};
const strict=(data,keys)=>{if(!data||typeof data!=='object'||Array.isArray(data)||Object.keys(data).some(k=>!keys.includes(k)))fail('invalid-argument','Invalid request');};
const admin=req=>{if(!req.auth)fail('unauthenticated','Sign-in required');if(!isSuperAdminToken(req.auth.token||{}))fail('permission-denied','Administrator required');return req.auth.uid;};
const call=fn=>onCall({region:'europe-west1',timeoutSeconds:45},fn);

// Commissioning means that an operator has REVIEWED site readiness, NOT that a
// router is remotely connected. Public site catalog stays disabled by default.
export const hotspotCommissionSite=call(async req=>{
 const uid=admin(req);strict(req.data,['siteId','nasId','checklist','publishPortal']);
 const siteId=id(req.data.siteId),nasId=id(req.data.nasId);
 const checks=req.data.checklist;
 const required=['guestNetworkIsolated','radiusNasRegistered','radiusAccountingTested','privacyNoticeReady'];
 if(!checks||typeof checks!=='object'||Array.isArray(checks)||Object.keys(checks).some(k=>!required.includes(k))||required.some(k=>checks[k]!==true))fail('failed-precondition','All four commissioning attestations are required');
 if(typeof req.data.publishPortal!=='boolean')fail('invalid-argument','Invalid portal visibility');
 const siteRef=db().collection('hotspotSites').doc(siteId);
 const auditRef=db().collection('hotspotAudit').doc(randomUUID());
 await db().runTransaction(async tx=>{
   const site=await tx.get(siteRef);
   if(!site.exists)fail('not-found','Site not found');
   if(site.data().status!=='planned')fail('failed-precondition','Site has already moved beyond planning');
   tx.update(siteRef,{status:'active',collectorNasId:nasId,portalPublished:req.data.publishPortal,commissionedBy:uid,commissionedAt:FieldValue.serverTimestamp(),routerConnected:false,updatedAt:FieldValue.serverTimestamp()});
   tx.create(auditRef,{actor:uid,action:'commission_attested',resource:'sites',resourceId:siteId,at:FieldValue.serverTimestamp()});
 });
 return {ok:true,siteId,siteStatus:'active',actualRouterConnectionVerified:false,portalPublished:req.data.publishPortal};
});
export const hotspotPublishPlan=call(async req=>{
 const uid=admin(req);strict(req.data,['planId','siteId']);
 const planId=id(req.data.planId),siteId=id(req.data.siteId);
 const siteRef=db().collection('hotspotSites').doc(siteId),planRef=db().collection('hotspotPlans').doc(planId);
 const auditRef=db().collection('hotspotAudit').doc(randomUUID());
 await db().runTransaction(async tx=>{
  const site=await tx.get(siteRef),plan=await tx.get(planRef);
  if(!site.exists||site.data().status!=='active')fail('failed-precondition','Commission site first');
  if(!plan.exists||plan.data().status!=='draft')fail('failed-precondition','Only draft plans may be published');
  tx.update(planRef,{siteId,status:'active',publishedBy:uid,publishedAt:FieldValue.serverTimestamp()});
  tx.create(auditRef,{actor:uid,action:'publish',resource:'plans',resourceId:planId,at:FieldValue.serverTimestamp()});
 });
 return {ok:true,planId,siteId,networkProvisioned:false};
});
export const hotspotPortalCatalog=call(async req=>{
 strict(req.data,['siteId']);const siteId=id(req.data.siteId);
 const site=await db().collection('hotspotSites').doc(siteId).get();
 if(!site.exists||site.data().status!=='active'||site.data().portalPublished!==true)
    fail('not-found','This hotspot is not published');
 const plans=await db().collection('hotspotPlans').where('siteId','==',siteId).limit(50).get();
 return {site:{id:site.id,name:site.data().name,ssid:site.data().ssid},
 plans:plans.docs.filter(p=>p.data().status==='active').map(p=>({
   id:p.id,name:p.data().name,priceKes:p.data().priceKes,
   durationMinutes:p.data().durationMinutes,downloadMbps:p.data().downloadMbps,
   uploadMbps:p.data().uploadMbps,maxDevices:p.data().maxDevices
 })),
 enabled:false,message:'Purchase and internet activation are not available until verified gateway and payment integrations are commissioned.'};
});
export const hotspotSessionSummary=call(async req=>{
 admin(req);strict(req.data,['siteId']);const siteId=id(req.data.siteId);
 const site=await db().collection('hotspotSites').doc(siteId).get();
 if(!site.exists)fail('not-found','Site not found');
 const entries=await db().collection('hotspotAccountingEvents').where('siteId','==',siteId).limit(100).get();
 const events=entries.docs.map(x=>x.data());
 return {siteId,eventCount:events.length,...summarizeRadiusSessions(events),
 source:'radius_collector',limit:100,gatewayVerified:site.data().gatewayVerified===true,
 caveat:'Uses last cumulative counter per sampled session; not authoritative billing or proof of gateway operation.'};
});

export const hotspotSetPortalVisibility=call(async req=>{
 const uid=admin(req);strict(req.data,['siteId','published']);
 const siteId=id(req.data.siteId);
 if(typeof req.data.published!=='boolean')fail('invalid-argument','Boolean published flag required');
 const siteRef=db().collection('hotspotSites').doc(siteId),auditRef=db().collection('hotspotAudit').doc(randomUUID());
 await db().runTransaction(async tx=>{
  const site=await tx.get(siteRef);
  if(!site.exists||site.data().status!=='active')fail('failed-precondition','Commission the site before publishing');
  tx.update(siteRef,{portalPublished:req.data.published,updatedAt:FieldValue.serverTimestamp()});
  tx.create(auditRef,{actor:uid,action:req.data.published?'portal_publish':'portal_hide',resource:'sites',resourceId:siteId,at:FieldValue.serverTimestamp()});
 });
 return {ok:true,siteId,portalPublished:req.data.published,routerConnected:false};
});
