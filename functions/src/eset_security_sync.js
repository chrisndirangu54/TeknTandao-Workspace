// Multi-tenant ESET Connect: operator-verified tenant ownership mapping, read-only ingestion.
import './index.js';
import {getFirestore,FieldValue} from 'firebase-admin/firestore';
import {onCall,HttpsError} from 'firebase-functions/v2/https';
import {defineSecret} from 'firebase-functions/params';
import {z} from 'zod';
import {randomUUID} from 'node:crypto';
import {identifier} from './domain.js';
import {isBootstrapSuperAdminToken} from './super_admin_domain.js';
import {esetConnectToken,collectEsetPages,projectDevice,projectDetection} from './eset_connect_client.js';

const db=getFirestore(),region='europe-west1',user=defineSecret('ESET_CONNECT_USERNAME'),pass=defineSecret('ESET_CONNECT_PASSWORD');
const regionSchema=z.enum(['eu','de','us','ca','jpn']);
const uuidSchema=z.string().min(8).max(128).regex(/^[a-zA-Z0-9_-]+(?:-[a-zA-Z0-9_-]+)*$/);
const tenantRef=id=>db.doc('organizations/'+id+'/securityIntegrations/eset');
async function context(req,operator=false) {
  if (!req.auth) throw new HttpsError('unauthenticated','Authentication required');
  const orgId=identifier(req.data?.orgId);
  const snap=await db.doc('organizations/'+orgId+'/members/'+req.auth.uid).get();
  if(snap.data()?.role!=='owner')throw new HttpsError('permission-denied','Organization owner required');
  if(operator&&!isBootstrapSuperAdminToken(req.auth.token||{}))
    throw new HttpsError('permission-denied','Only the platform operator can authorize ESET customer bindings');
  return {orgId,uid:req.auth.uid};
}
async function connection(orgId) {
  const snap=await tenantRef(orgId).get(),d=snap.data()||{};
  if(d.connectApproved!==true||!d.ownerUuid||!d.region)
    throw new HttpsError('failed-precondition','ESET connection requires an operator-approved, consented customer binding');
  return d;
}
// Approval requires externally verified entitlement and the explicit customer's recorded consent.
// This does not grant new ESET access; it maps an already authorised ESET tenant.
export const approveEsetCustomerBinding=onCall({region,enforceAppCheck:true},async req=>{
  const {orgId,uid}=await context(req,true);
  const input=z.object({ownerUuid:uuidSchema,region:regionSchema,
    consentReference:z.string().trim().min(8).max(250),
    entitlementReference:z.string().trim().min(8).max(250),
    confirmed:z.literal(true)}).strict().parse(req.data?.binding);
  const global=db.doc('esetTenantBindings/'+input.region+'_'+input.ownerUuid);
  await db.runTransaction(async tx=>{
    const existing=await tx.get(global);
    const previous=await tx.get(tenantRef(orgId));
    if(previous.exists && previous.data()?.ownerUuid &&
      (previous.data().ownerUuid!==input.ownerUuid || previous.data().region!==input.region))
      throw new HttpsError('failed-precondition','Rebinding requires a separate audited migration and data purge');
    if(existing.exists&&existing.data()?.orgId!==orgId)
      throw new HttpsError('already-exists','This ESET tenant is bound to another workspace');
    tx.set(global,{orgId,createdBy:uid,createdAt:FieldValue.serverTimestamp()},{merge:true});
    tx.set(tenantRef(orgId),{provider:'eset',region:input.region,ownerUuid:input.ownerUuid,
      connectApproved:true,consentReference:input.consentReference,
      entitlementReference:input.entitlementReference,approvedBy:uid,
      approvedAt:FieldValue.serverTimestamp(),syncStatus:'not_started'},{merge:true});
  });
  return {approved:true,region:input.region,readOnly:true};
});
export const getEsetSecurityOverview=onCall({region,enforceAppCheck:true},async req=>{
  const {orgId}=await context(req);
  const config=(await tenantRef(orgId).get()).data()||{};
  const org=db.collection('organizations').doc(orgId);
  const currentRun=config.lastSyncRunId;
  const [devices,detections]=currentRun?await Promise.all([
    org.collection('esetDevices').where('syncRunId','==',currentRun).limit(100).get(),
    org.collection('esetDetections').where('syncRunId','==',currentRun).limit(100).get()
  ]):[{docs:[],size:0},{docs:[],size:0}];
  return {status:config.connectApproved===true?'approved':'awaiting_entitlement',
    region:config.region||null,ownerUuid:config.ownerUuid||null,
    lastSyncAt:config.lastSyncAt?.toDate?.()?.toISOString?.()??null,
    syncStatus:config.syncStatus||'not_started',partial:config.partial===true||devices.size===100||detections.size===100,
    devices:devices.docs.map(x=>x.data()),detections:detections.docs.map(x=>x.data()),
    permissions:{readOnly:true,licenseOrders:false,endpointActions:false,
      remotePolicyChanges:false,incidentResolution:false}};
});
export const syncEsetSecuritySnapshot=onCall({
  region,enforceAppCheck:true,timeoutSeconds:120,secrets:[user,pass]
},async req=>{
  const {orgId,uid}=await context(req,true);
  const config=await connection(orgId);
  if(!user.value()||!pass.value())throw new HttpsError('failed-precondition','Dedicated ESET Connect API secrets missing');
  // Fixed, bounded fetching. Do not cache JWTs, unfiltered provider payloads or secrets.
  try {
    const token=await esetConnectToken({region:config.region,username:user.value(),password:pass.value()});
    const devices=await collectEsetPages({region:config.region,kind:'devices',token,maxPages:5});
    if(!devices.complete)throw new Error('Device inventory exceeds safe pagination boundary');
    const selected=devices.entries.map(x=>projectDevice(x,config.ownerUuid)).filter(Boolean);
    const allowed=new Set(selected.map(x=>x.id));
    const detections=await collectEsetPages({region:config.region,kind:'detections',token,
      maxPages:5,startTime:new Date(Date.now()-7*86400000).toISOString()});
    if(!detections.complete)throw new Error('Detection collection exceeds safe pagination boundary');
    const scoped=detections.entries.map(x=>projectDetection(x,allowed)).filter(Boolean);
    const root=db.doc('organizations/'+orgId);
    const syncRunId=randomUUID();
    const values=[
      ...selected.map(d=>[root.collection('esetDevices').doc(d.id),{...d,syncRunId}]),
      ...scoped.map(d=>[root.collection('esetDetections').doc(d.id),{...d,syncRunId}])
    ];
    // Store a new snapshot identifier. Old snapshots are excluded from overview.
    // Config advances only after every bounded chunk is successfully committed.
    for(let i=0;i<values.length;i+=400) {
      const chunk=db.batch();
      for(const [ref,d] of values.slice(i,i+400))
        chunk.set(ref,{...d,updatedAt:FieldValue.serverTimestamp()},{merge:true});
      await chunk.commit();
    }
    await tenantRef(orgId).set({syncStatus:'ok',partial:false,
      lastSyncAt:FieldValue.serverTimestamp(),lastSyncBy:uid,lastSyncRunId:syncRunId,
      deviceCount:selected.length,detectionCount:scoped.length},{merge:true});
    return {success:true,devices:selected.length,detections:scoped.length,
      readOnly:true,externalActionsTaken:false};
  } catch(error) {
    await tenantRef(orgId).set({syncStatus:'failed',lastAttemptAt:FieldValue.serverTimestamp()},{merge:true});
    throw new HttpsError('unavailable',
      'ESET snapshot unavailable; verify API rights, tenancy mapping and provider pagination');
  }
});
