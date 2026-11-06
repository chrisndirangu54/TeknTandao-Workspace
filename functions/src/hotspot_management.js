// Hotspot management control plane. No network access or payment settlement.
import {randomBytes,createHash,randomUUID} from 'node:crypto';
import {getFirestore,FieldValue} from 'firebase-admin/firestore';
import {onCall,HttpsError} from 'firebase-functions/v2/https';
import {isSuperAdminToken} from './super_admin_domain.js';

const region='europe-west1';
const collections={sites:'hotspotSites',plans:'hotspotPlans',vouchers:'hotspotVouchers'};
const db=()=>getFirestore();
const fail=(code,message)=>{throw new HttpsError(code,message);};
const field=(data,key,max=120)=>{const v=data?.[key];if(typeof v!=='string'||!v.trim()||v.trim().length>max)fail('invalid-argument',`Invalid ${key}`);return v.trim();};
const id=value=>{if(typeof value!=='string'||!/^[a-zA-Z0-9_-]{5,100}$/.test(value))fail('invalid-argument','Invalid ID');return value;};
const amount=(value,min,max,name)=>{if(!Number.isInteger(value)||value<min||value>max)fail('invalid-argument',`Invalid ${name}`);return value;};
const admin=req=>{if(!req.auth)fail('unauthenticated','Sign in required');if(!isSuperAdminToken(req.auth.token||{}))fail('permission-denied','Super-admin access required');return req.auth.uid;};
const call=fn=>onCall({region,timeoutSeconds:45},fn);
const clean=s=>{const {codeHash,...safe}=s.data();return {id:s.id,...safe,createdAt:s.data().createdAt?.toDate?.()?.toISOString?.()||null};};
const requireKeys=(data,keys)=>{if(!data||typeof data!=='object'||Array.isArray(data)||Object.keys(data).some(k=>!keys.includes(k)))fail('invalid-argument','Unexpected input');};
const audit=(batch,actor,action,resource,id)=>batch.create(db().collection('hotspotAudit').doc(randomUUID()),{actor,action,resource,resourceId:id,at:FieldValue.serverTimestamp()});
export const hotspotCatalog=call(async req=>{admin(req);return {resources:Object.keys(collections),liveRouter:false,paymentVerified:false,portalEnabled:false,integrations:['MikroTik RouterOS','RADIUS/FreeRADIUS','UniFi','M-Pesa STK + webhook'],note:'Router and payment connectors require separate deployment and verification.'};});
export const hotspotList=call(async req=>{admin(req);requireKeys(req.data,['resource']);const resource=req.data.resource;if(!collections[resource])fail('invalid-argument','Unknown resource');const s=await db().collection(collections[resource]).limit(100).get();return {records:s.docs.map(clean),limit:100,live:false};});
export const hotspotCreate=call(async req=>{
 const actor=admin(req);requireKeys(req.data,['resource','record']);const {resource,record}=req.data;
 if(!collections[resource]||!record||typeof record!=='object'||Array.isArray(record))fail('invalid-argument','Invalid resource or record');
 let value;
 if(resource==='sites'){requireKeys(record,['name','location','ssid']);value={name:field(record,'name'),location:field(record,'location'),ssid:field(record,'ssid',32),status:'planned',routerConnected:false};}
 else if(resource==='plans'){requireKeys(record,['name','durationMinutes','priceKes','downloadMbps','uploadMbps','maxDevices']);value={name:field(record,'name'),durationMinutes:amount(record.durationMinutes,1,525600,'durationMinutes'),priceKes:amount(record.priceKes,0,1000000,'priceKes'),downloadMbps:amount(record.downloadMbps,1,10000,'downloadMbps'),uploadMbps:amount(record.uploadMbps,1,10000,'uploadMbps'),maxDevices:amount(record.maxDevices,1,100,'maxDevices'),status:'draft'};}
 else if(resource==='vouchers'){requireKeys(record,['siteId','planId']);const siteId=id(record.siteId),planId=id(record.planId);const refs=await Promise.all([db().collection(collections.sites).doc(siteId).get(),db().collection(collections.plans).doc(planId).get()]);if(refs.some(r=>!r.exists)||refs[0].data().status!=='active'||refs[1].data().status!=='active'||refs[1].data().siteId!==siteId)fail('failed-precondition','Active site and published site-bound plan required');const code=randomBytes(9).toString('hex').toUpperCase();value={siteId,planId,codeHash:createHash('sha256').update(code).digest('hex'),codeLast4:code.slice(-4),status:'unissued',redeemed:false,routerProvisioned:false};value._oneTimeCode=code;}
 else fail('invalid-argument','Unsupported resource');
 const oneTimeCode=value._oneTimeCode;delete value._oneTimeCode;
 const doc=db().collection(collections[resource]).doc(randomUUID());const batch=db().batch();batch.create(doc,{...value,createdBy:actor,createdAt:FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp()});audit(batch,actor,'create',resource,doc.id);await batch.commit();
 return {ok:true,id:doc.id,oneTimeCode:oneTimeCode||null,networkActivated:false,paymentVerified:false};
});
export const hotspotRevokeVoucher=call(async req=>{
 const actor=admin(req);requireKeys(req.data,['id']);const doc=db().collection(collections.vouchers).doc(id(req.data.id));const auditDoc=db().collection('hotspotAudit').doc(randomUUID());
 await db().runTransaction(async tx=>{const before=await tx.get(doc);if(!before.exists)fail('not-found','Voucher missing');if(before.data().status==='revoked')fail('failed-precondition','Already revoked');tx.update(doc,{status:'revoked',updatedAt:FieldValue.serverTimestamp(),updatedBy:actor});tx.create(auditDoc,{actor,action:'revoke',resource:'vouchers',resourceId:doc.id,at:FieldValue.serverTimestamp()});});
 return {ok:true,networkRevocationExecuted:false};
});
