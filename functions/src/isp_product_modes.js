import {draftIspInvoice,prepareIspPaymentEvidence} from './isp_billing_domain.js';
import {draftIspProvisioningPlan,validateIspDriver,normalizeIspTelemetry} from './isp_integration_contracts.js';
import {normalizeIspConfig,ispConfigKinds,validateIspActivation,approveIspActivation} from './isp_typed_config_domain.js';
import {getFirestore,FieldValue,FieldPath} from 'firebase-admin/firestore';
import {onCall,HttpsError} from 'firebase-functions/v2/https';
import {identifier,canAccess} from './domain.js';
import {isSuperAdminToken} from './super_admin_domain.js';
import {ispStoragePath,ispModeNames,ispRecordKinds,canUseIspMode} from './isp_product_modes_domain.js';
const db=getFirestore(),region='europe-west1';
const modes=ispModeNames;
const collections=Object.freeze(Object.fromEntries(ispRecordKinds.map(k=>[k,k])));
const parseMode=value=>{
 if(!Object.hasOwn(modes,value))throw new HttpsError('invalid-argument','Specify managed or operator ISP mode');
 return value;
};
async function context(req,write=false){
 if(!req.auth)throw new HttpsError('unauthenticated','Sign in first');
 const mode=parseMode(req.data?.mode),uid=req.auth.uid,superAdmin=isSuperAdminToken(req.auth.token||{});
 if(mode==='operator'){
  if(!canUseIspMode({mode,superAdmin}))throw new HttpsError('permission-denied','TeknTandao ISP operations are platform-admin only');
  return {root:db.doc(ispStoragePath(mode)),mode,uid};
 }
 const orgId=identifier(req.data?.orgId);
 const org=db.collection('organizations').doc(orgId);
 const [member,app]=await Promise.all([
  org.collection('members').doc(uid).get(),org.collection('apps').doc('isp').get()
 ]);
 if(!canUseIspMode({mode,superAdmin,member:member.exists?member.data():null,hasAppAccess:member.exists&&canAccess(member.data(),'isp',app.data()),write}))
  throw new HttpsError('permission-denied','Third-party ISP workspace access required');
 return {root:db.doc(ispStoragePath(mode,orgId)),mode,uid};
}
const publicRecord=d=>({id:d.id,...d.data(),createdAt:d.data().createdAt?.toDate?.()?.toISOString?.()??null});
export const getIspProductModes=onCall({region},async req=>{
 if(!req.auth)throw new HttpsError('unauthenticated','Sign in first');
 const allowed=['managed'];
 if(isSuperAdminToken(req.auth.token||{}))allowed.push('operator');
 return {products:[
  {id:'managed',title:'Third-party ISP Management',description:'Manage an independent ISP business in its own workspace',customerType:'ISP business',liveNetwork:false},
  {id:'operator',title:'TeknTandao ISP',description:'TeknTandao-owned ISP subscriber and network operations',customerType:'TeknTandao operations',liveNetwork:false}
 ],availableModes:allowed,legacyConsole:'Existing global super-admin ISP suite remains a separate legacy view'};
});
export const getIspWorkspaceOverview=onCall({region},async req=>{
 const {root,mode}=await context(req);
 const stats={};
 for(const [key,collection] of Object.entries(collections)){
  const snap=await root.collection(collection).limit(101).get();
  stats[key]={records:snap.size,complete:snap.size<101};
 }
 return {mode,product:modes[mode],stats,scope:root.path,
  liveProvisioning:false,liveBilling:false,liveTelemetry:false,
  note:'Logical isolation: records only, not connected router or payment operations.'};
});
export const listIspWorkspaceRecords=onCall({region},async req=>{
 const {root,mode}=await context(req);
 const kind=req.data?.kind;
 if(!Object.hasOwn(collections,kind))throw new HttpsError('invalid-argument','Unknown ISP record kind');
 const pageSize=req.data?.pageSize??30;
 if(!Number.isInteger(pageSize)||pageSize<1||pageSize>100)
  throw new HttpsError('invalid-argument','Page size must be 1-100');
 let query=root.collection(collections[kind]).orderBy(FieldPath.documentId()).limit(pageSize+1);
 if(req.data?.afterId){
  const cursor=await root.collection(collections[kind]).doc(identifier(req.data.afterId)).get();
  if(!cursor.exists)throw new HttpsError('invalid-argument','Invalid record cursor');
  query=query.startAfter(cursor);
 }
 const snap=await query.get(),docs=snap.docs.slice(0,pageSize),hasMore=snap.size>pageSize;
 return {mode,kind,records:docs.map(publicRecord),hasMore,
  nextCursor:hasMore?docs[docs.length-1].id:null};
});
export const saveIspWorkspaceRecord=onCall({region},async req=>{
 const {root,uid,mode}=await context(req,true);
 const kind=req.data?.kind;
 if(!Object.hasOwn(collections,kind))throw new HttpsError('invalid-argument','Invalid ISP record kind');
 const id=identifier(req.data?.id);
 const data=req.data?.record;
 if(!data||typeof data!=='object'||Array.isArray(data)||
  Object.keys(data).some(key=>!['label','status','notes','externalRef'].includes(key)))
  throw new HttpsError('invalid-argument','Allowed fields: label, status, notes, externalRef');
 if(typeof data.label!=='string'||!data.label.trim()||data.label.length>120||
  typeof data.status!=='string'||!['planned','active','paused','retired'].includes(data.status)||
  data.notes!==undefined&&(typeof data.notes!=='string'||data.notes.length>1000)||
  data.externalRef!==undefined&&(typeof data.externalRef!=='string'||data.externalRef.length>120))
  throw new HttpsError('invalid-argument','Invalid ISP record');
 const ref=root.collection(collections[kind]).doc(id);
 await db.runTransaction(async tx=>{
  const existing=await tx.get(ref);
  if(existing.exists)throw new HttpsError('already-exists','Record ID already exists');
  tx.create(ref,{...data,label:data.label.trim(),mode,createdBy:uid,createdAt:FieldValue.serverTimestamp()});
 });
 return {id,kind,mode,status:'created'};
});

const asValidationError=error=>new HttpsError('invalid-argument',error.message||'Invalid ISP operation');
export const createIspConfigurationRecord=onCall({region},async req=>{
 const {root,uid,mode}=await context(req,true);
 const kind=req.data?.kind;
 if(!ispConfigKinds.includes(kind))throw new HttpsError('invalid-argument','Unsupported typed ISP kind');
 const id=identifier(req.data?.id);
 let configuration;
 try{configuration=normalizeIspConfig(kind,req.data?.record);}catch(error){throw asValidationError(error);}
 if(kind==='subscribers'&&configuration.accountCode!==id)
   throw new HttpsError('invalid-argument','Subscriber account code must match record ID');
 const dependencies=kind==='subscribers'?[
   root.collection('plans').doc(configuration.planId),
   root.collection('sites').doc(configuration.siteId),
   ...(configuration.deviceId?[root.collection('devices').doc(configuration.deviceId)]:[])
 ]:kind==='devices'?[root.collection('sites').doc(configuration.siteId)]:[];
 const record=root.collection(kind).doc(id);
 await db.runTransaction(async tx=>{
   const [existing,...refs]=await Promise.all([tx.get(record),...dependencies.map(ref=>tx.get(ref))]);
   if(existing.exists)throw new HttpsError('already-exists','ISP configuration already exists');
   if(refs.some(ref=>!ref.exists))throw new HttpsError('failed-precondition','Referenced plan, site or device must exist within this ISP');
   if(kind==='subscribers'&&configuration.deviceId&&
      refs[2].data()?.siteId!==configuration.siteId)
      throw new HttpsError('failed-precondition','Subscriber and network device must belong to the same ISP site');
   tx.create(record,{...configuration,mode,recordType:'typed_configuration',createdAt:FieldValue.serverTimestamp(),createdBy:uid});
 });
 return {id,kind,mode,created:true,liveNetwork:false};
});

export const requestIspServiceActivation=onCall({region},async req=>{
 const {root,uid,mode}=await context(req,true);
 let input;
 try{input=validateIspActivation(req.data?.request);}catch(error){throw asValidationError(error);}
 const subscriber=root.collection('subscribers').doc(input.subscriberId);
 const activation=root.collection('activationRequests').doc(input.idempotencyKey);
 await db.runTransaction(async tx=>{
   const [sub,existing]=await Promise.all([tx.get(subscriber),tx.get(activation)]);
   if(!sub.exists||sub.data()?.recordType!=='typed_configuration')
     throw new HttpsError('failed-precondition','Typed subscriber configuration required');
   if(existing.exists)throw new HttpsError('already-exists','Activation request already exists');
   tx.create(activation,{...input,mode,state:'awaiting_approval',executionState:'not_connected',
     requestedBy:uid,createdAt:FieldValue.serverTimestamp()});
 });
 return {requestId:activation.id,state:'awaiting_approval',executed:false};
});

export const approveIspServiceActivation=onCall({region},async req=>{
 const {root,uid}=await context(req,true);
 const id=identifier(req.data?.requestId);
 const activation=root.collection('activationRequests').doc(id);
 await db.runTransaction(async tx=>{
   const previous=await tx.get(activation);
   if(!previous.exists)throw new HttpsError('not-found','Activation request not found');
   let decision;
   try{decision=approveIspActivation(previous.data(),uid);}
   catch(error){throw new HttpsError('failed-precondition',error.message);}
   tx.update(activation,{...decision,approvedAt:FieldValue.serverTimestamp()});
 });
 return {requestId:id,approved:true,executed:false,
   message:'Approved for a separately authenticated network controller; no command was sent.'};
});

export const previewIspProvisioning=onCall({region},async req=>{
 const {root}=await context(req);
 const id=identifier(req.data?.requestId);
 const activation=root.collection('activationRequests').doc(id);
 const approval=await activation.get();
 if(!approval.exists)throw new HttpsError('not-found','Activation request not found');
 const request=approval.data();
 if(request.state!=='approved_not_executed')throw new HttpsError('failed-precondition','Independent approval required');
 const subscriberDoc=await root.collection('subscribers').doc(identifier(request.subscriberId)).get();
 if(!subscriberDoc.exists)throw new HttpsError('failed-precondition','Subscriber missing');
 const subscriber=subscriberDoc.data();
 if(!subscriber.planId||!subscriber.deviceId)throw new HttpsError('failed-precondition','Linked service plan and network device required');
 const [planDoc,deviceDoc]=await Promise.all([
  root.collection('plans').doc(identifier(subscriber.planId)).get(),
  root.collection('devices').doc(identifier(subscriber.deviceId)).get()
 ]);
 if(!planDoc.exists||!deviceDoc.exists)throw new HttpsError('failed-precondition','Referenced ISP equipment or plan missing');
 try{
  const driver=validateIspDriver(deviceDoc.data());
  const preview=draftIspProvisioningPlan({request,subscriber,plan:planDoc.data(),device:deviceDoc.data()});
  return {preview,driver,executed:false};
 }catch(error){throw new HttpsError('failed-precondition',error.message);}
});

export const recordIspTelemetrySample=onCall({region},async req=>{
 const {root,uid,mode}=await context(req,true);
 let sample;
 try{sample=normalizeIspTelemetry(req.data?.sample);}
 catch(error){throw new HttpsError('invalid-argument',error.message);}
 const device=await root.collection('devices').doc(sample.deviceId).get();
 if(!device.exists||device.data().recordType!=='typed_configuration'||
    device.data().siteId!==sample.siteId)
  throw new HttpsError('failed-precondition','Device must be registered at the same ISP site');
 const id=root.collection('telemetrySamples').doc();
 await id.create({...sample,mode,createdAt:FieldValue.serverTimestamp(),
  submittedBy:uid,sourceType:'admin_submitted_unverified'});
 return {id:id.id,received:true,verified:false,liveCollector:false};
});
export const listIspTelemetrySamples=onCall({region},async req=>{
 const {root}=await context(req);
 const pageSize=req.data?.pageSize??30;
 if(!Number.isInteger(pageSize)||pageSize<1||pageSize>100)
   throw new HttpsError('invalid-argument','Invalid page size');
 const snap=await root.collection('telemetrySamples').orderBy('observedAtMs','desc').limit(pageSize).get();
 return {samples:snap.docs.map(d=>({id:d.id,...d.data(),
  createdAt:d.data().createdAt?.toDate?.()?.toISOString?.()??null})),
  trustedLiveTelemetry:false,morePagesMayExist:snap.size===pageSize};
});

export const createIspInvoiceDraft=onCall({region},async req=>{
 const {root,uid,mode}=await context(req,true);
 const invoiceId=identifier(req.data?.invoiceId);
 const subscriberId=identifier(req.data?.subscriberId);
 const subscriber=await root.collection('subscribers').doc(subscriberId).get();
 if(!subscriber.exists||subscriber.data()?.recordType!=='typed_configuration')
  throw new HttpsError('failed-precondition','Typed subscriber required');
 const planId=identifier(subscriber.data().planId);
 const plan=await root.collection('plans').doc(planId).get();
 if(!plan.exists||plan.data()?.recordType!=='typed_configuration')
  throw new HttpsError('failed-precondition','Installed ISP tariff required');
 let invoice;
 try{invoice=draftIspInvoice({subscriberId,planId,
  priceMinorKes:plan.data().priceMinorKes,period:req.data?.period,reference:invoiceId});}
 catch(error){throw new HttpsError('invalid-argument',error.message);}
 await root.collection('invoices').doc(invoiceId).create({
  ...invoice,mode,createdBy:uid,createdAt:FieldValue.serverTimestamp()});
 return {invoiceId,created:true,paymentVerified:false};
});
export const submitIspPaymentEvidence=onCall({region},async req=>{
 const {root,uid,mode}=await context(req,true);
 let evidence;
 try{evidence=prepareIspPaymentEvidence(req.data?.evidence);}
 catch(error){throw new HttpsError('invalid-argument',error.message);}
 const invoice=root.collection('invoices').doc(evidence.invoiceId);
 const evidenceRef=root.collection('paymentEvidence').doc(evidence.reference);
 await db.runTransaction(async tx=>{
  const [bill,prior]=await Promise.all([tx.get(invoice),tx.get(evidenceRef)]);
  if(!bill.exists)throw new HttpsError('not-found','Invoice not found');
  if(prior.exists)throw new HttpsError('already-exists','Payment reference already submitted');
  tx.create(evidenceRef,{...evidence,mode,submittedBy:uid,
   createdAt:FieldValue.serverTimestamp()});
 });
 return {reference:evidence.reference,received:true,verified:false,invoiceSettled:false};
});
