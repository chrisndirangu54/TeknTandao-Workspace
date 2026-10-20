import {randomUUID} from 'node:crypto';
import {getFirestore,FieldValue} from 'firebase-admin/firestore';
import {onCall,HttpsError} from 'firebase-functions/v2/https';
import {isSuperAdminToken} from './super_admin_domain.js';
import {ispSchema,ispIntegrationStatus,normalizeIspRecord,allowedIspTransition,ispRecordId,ispLinkHealth} from './isp_suite_domain.js';

// Shared Flutter Firebase project. All network, billing, firmware and messaging
// operations in this module are RECORDS, never side effects on external systems.
const region='europe-west1';
const stamp=()=>FieldValue.serverTimestamp();
const db=()=>getFirestore();
const fails=(code,message)=>new HttpsError(code,message);
function superAdmin(req){
 if(!req.auth)throw fails('unauthenticated','Sign in required');
 if(!isSuperAdminToken(req.auth.token||{}))throw fails('permission-denied','Super-admin access required');
 return req.auth.uid;
}
function validateModule(name){
 if(typeof name!=='string'||!Object.hasOwn(ispSchema,name))throw fails('invalid-argument','Unknown ISP module');
 return ispSchema[name];
}
function callable(fn){
 return onCall({region,timeoutSeconds:60},async req=>{
  try{return await fn(req);}
  catch(e){
   if(e instanceof HttpsError)throw e;
   if(e?.message&&/^(Unknown ISP|Unexpected record|Missing |Invalid |Latitude and longitude)/.test(e.message))
     throw fails('invalid-argument',e.message);
   throw fails('internal','ISP workflow failed');
  }
 });
}
function validateShape(data,keys){
 if(!data||typeof data!=='object'||Array.isArray(data)||Object.keys(data).some(x=>!keys.includes(x)))
   throw fails('invalid-argument','Unexpected request parameters');
}
const serialize=snap=>({id:snap.id,...snap.data(),
 createdAt:snap.data().createdAt?.toDate?.()?.toISOString?.()||null,
 updatedAt:snap.data().updatedAt?.toDate?.()?.toISOString?.()||null});
const accountDoc=code=>db().collection('ispSubscribers').doc(String(code).trim().toUpperCase());
async function requireRefs(mod,data){
 const needed=[];
 if(['telemetry','provisioning','firmware'].includes(mod))needed.push(db().collection('ispDevices').doc(data.deviceId));
 if(['support','invoices','payments','provisioning'].includes(mod)){
  const code=data.subscriberId;
  if(typeof code!=='string'||!/^[a-z0-9_-]{2,64}$/i.test(code))throw fails('invalid-argument','Subscriber account code is required');
  needed.push(accountDoc(code));
 }
 if(mod==='payments')needed.push(db().collection('ispInvoices').doc(data.invoiceCode.toUpperCase()));
 for(const ref of needed){const result=await ref.get();if(!result.exists)throw fails('failed-precondition','Linked device, subscriber or invoice does not exist');}
}
export const ispSuiteCatalog=callable(async req=>{
 superAdmin(req);
 return {modules:ispSchema,integrations:ispIntegrationStatus,
  liveNetwork:false,liveBilling:false,liveProvisioning:false,liveMessaging:false,predictiveAi:false};
});
export const ispSuiteRecords=callable(async req=>{
 superAdmin(req);
 validateShape(req.data,['module']);
 const name=req.data.module,meta=validateModule(name);
 const snap=await db().collection(meta.collection).limit(100).get();
 return {module:name,records:snap.docs.map(serialize),limit:100,
  caveat:name==='telemetry'?'Samples were submitted manually; device collectors are not connected.':'Records are not proof of real network provisioning.'};
});
export const ispSuiteCreateRecord=callable(async req=>{
 const uid=superAdmin(req);
 validateShape(req.data,['module','record']);
 const moduleName=req.data.module,meta=validateModule(moduleName);
 const data=normalizeIspRecord(moduleName,req.data.record);
 await requireRefs(moduleName,data);
 if(moduleName==='telemetry')data.health=ispLinkHealth(data);
 if(moduleName==='payments')data.verified=false;  // never settle manually
 if(['provisioning','firmware','policies'].includes(moduleName))data.executed=false;
 if(moduleName==='support')data.category=/payment|mpesa|invoice|paid|renew/i.test(data.message)?'billing':
    /offline|down|no internet|los|disconnected/i.test(data.message)?'connectivity':
    /slow|jitter|speed|lag|buffer|latency/i.test(data.message)?'performance':'general';
 const id=ispRecordId(moduleName,data,randomUUID());
 const entry=db().collection(meta.collection).doc(id);
 const audit=db().collection('ispAudit').doc(randomUUID());
 const batch=db().batch();
 batch.create(entry,{...data,status:meta.workflow?.initial||'recorded',
  createdAt:stamp(),updatedAt:stamp(),createdBy:uid});
 batch.create(audit,{resource:'suite:'+moduleName,resourceId:id,action:'create',
  actorUid:uid,createdAt:stamp()});
 try{await batch.commit();}
 catch(e){
  if(String(e.code)==='6'||/already exists/i.test(String(e.message)))
    throw fails('already-exists','Record code or payment reference already exists');
  throw e;
 }
 return {ok:true,id,executed:false,providerPaymentVerified:false};
});
export const ispSuiteChangeStatus=callable(async req=>{
 const uid=superAdmin(req);
 validateShape(req.data,['module','id','status']);
 const {module:moduleName,id,status}=req.data,meta=validateModule(moduleName);
 if(typeof id!=='string'||!/^[A-Za-z0-9_-]{2,120}$/.test(id))
   throw fails('invalid-argument','Invalid record ID');
 if(typeof status!=='string')throw fails('invalid-argument','Invalid status');
 const doc=db().collection(meta.collection).doc(id),audit=db().collection('ispAudit').doc(randomUUID());
 await db().runTransaction(async tx=>{
  const before=await tx.get(doc);
  if(!before.exists)throw fails('not-found','ISP record not found');
  const oldStatus=before.data().status||before.data().lifecycle||'planned';
  if(!allowedIspTransition(moduleName,oldStatus,status))
    throw fails('failed-precondition','Status transition not permitted');
  tx.update(doc,{status,updatedAt:stamp(),updatedBy:uid});
  tx.create(audit,{resource:'suite:'+moduleName,resourceId:id,
    action:'status:'+status,actorUid:uid,createdAt:stamp()});
 });
 return {ok:true,status,executed:false};
});
export const ispSuiteDashboard=callable(async req=>{
 superAdmin(req);
 const names=Object.keys(ispSchema);
 const pairs=await Promise.all(names.map(async name=>{
  const result=await db().collection(ispSchema[name].collection).count().get();
  return [name,result.data().count];
 }));
 return {counts:Object.fromEntries(pairs),integrations:ispIntegrationStatus,
  liveNetwork:false,livePayments:false,liveWhatsApp:false,predictiveModelsTrained:false,
  pilot:{subscribers:50,fiber:32,wireless:18,upstreamMbps:200,
   estimatedCapexKes:1029687,assumption:true},
  caveat:'Counts are saved records only; pilot values are assumptions.'};
});
export const ispSuiteCustomerRequest=callable(async req=>{
 const user=req.auth;
 if(!user)throw fails('unauthenticated','Sign in required');
 if(user.token?.email_verified!==true)throw fails('permission-denied','Please verify your email');
 validateShape(req.data,['site','service','message','consent']);
 const site=String(req.data.site||'').trim(),message=String(req.data.message||'').trim();
 const service=req.data.service;
 if(site.length<3||site.length>120||message.length<8||message.length>800||
  !['fiber_survey','wireless_survey','home_wifi','support_callback'].includes(service)||
  req.data.consent!==true)throw fails('invalid-argument','Invalid consent or service request');
 const today=new Date().toISOString().slice(0,10);
 const limit=db().collection('ispRequestLimits').doc(user.uid+'_'+today);
 const doc=db().collection('ispCustomerRequests').doc(randomUUID());
 await db().runTransaction(async tx=>{
  const prev=await tx.get(limit),uses=prev.exists?(prev.data().count||0):0;
  if(uses>=3)throw fails('resource-exhausted','Daily request limit reached');
  tx.set(limit,{count:uses+1,uid:user.uid,date:today,updatedAt:stamp()},{merge:true});
  tx.create(doc,{site,message,service,consent:true,createdAt:stamp(),
   createdBy:user.uid,email:user.token?.email||'',status:'received_unassigned'});
 });
 return {ok:true,id:doc.id,status:'received_unassigned'};
});
export const ispSuiteCustomerRequests=callable(async req=>{
 superAdmin(req);
 const snapshot=await db().collection('ispCustomerRequests').limit(100).get();
 return {requests:snapshot.docs.map(serialize),limit:100};
});
