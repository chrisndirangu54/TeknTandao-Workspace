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
