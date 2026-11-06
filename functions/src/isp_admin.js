import './index.js';
import {getFirestore, FieldValue} from 'firebase-admin/firestore';
import {onCall, HttpsError} from 'firebase-functions/v2/https';
import {z} from 'zod';
import {canAdvanceIncident, canAdvanceWorkOrder} from './isp_admin_domain.js';

const db = getFirestore();
const region = 'europe-west1';
const identifier = z.string().trim().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/);
const label = z.string().trim().min(2).max(140);
const description = z.string().trim().min(5).max(2000);
const optionalNote = z.string().trim().max(1000).optional();
const stamp = () => FieldValue.serverTimestamp();
const callable = handler => onCall({region,timeoutSeconds:60}, async request => {
  try {return await handler(request);}
  catch (error) {
    if (error instanceof HttpsError) throw error;
    if (error instanceof z.ZodError) throw new HttpsError('invalid-argument','Invalid ISP workflow input');
    throw new HttpsError('internal','ISP operation failed');
  }
});

async function requireIspOwner(request, orgId) {
  if (!request.auth?.uid) throw new HttpsError('unauthenticated','Sign in first');
  const org = db.doc('organizations/' + identifier.parse(orgId));
  const member = await org.collection('members').doc(request.auth.uid).get();
  if (!member.exists || (member.data().role !== 'owner' && request.auth.token.superAdmin !== true)) {
    throw new HttpsError('permission-denied','Workspace owner authorization required');
  }
  return {org, actorUid:request.auth.uid};
}
function audit(org, actorUid, action, targetId, details={}) {
  return {ref:org.collection('ispAudit').doc(), data:{actorUid,action,targetId,details,createdAt:stamp()}};
}
function serialize(doc) {
  const data=doc.data()||{};
  const output={id:doc.id,...data};
  for(const key of ['createdAt','updatedAt','resolvedAt']) {
    if (data[key]?.toDate) output[key]=data[key].toDate().toISOString();
  }
  return output;
}
const orgInput=z.object({orgId:identifier}).strict();
export const getIspAdminOverview=callable(async request=>{
  const input=orgInput.parse(request.data);
  const {org}=await requireIspOwner(request,input.orgId);
  const [orgSnap, incidents, workOrders, provisioningRequests]=await Promise.all([
    org.get(),
    org.collection('ispIncidents').orderBy('createdAt','desc').limit(50).get(),
    org.collection('ispWorkOrders').orderBy('createdAt','desc').limit(50).get(),
    org.collection('ispProvisioningRequests').orderBy('createdAt','desc').limit(50).get()
  ]);
  return {
    orgId:org.id, orgName:orgSnap.data()?.name || org.id,
    mode:'manual-workflow-only',
    notices:['No live router provisioning is implemented','No live M-Pesa payment processing is implemented','Incident records are manually reported, not telemetry-confirmed'],
    incidents:incidents.docs.map(serialize),workOrders:workOrders.docs.map(serialize),
    provisioningRequests:provisioningRequests.docs.map(serialize)
  };
});

export const createIspIncident=callable(async request=>{
  const input=z.object({
    orgId:identifier,title:label,description,
    segment:z.enum(['fiber','wireless','core','other']),
    severity:z.enum(['low','medium','high','critical'])
  }).strict().parse(request.data);
  const {org,actorUid}=await requireIspOwner(request,input.orgId);
  const ref=org.collection('ispIncidents').doc();
  const change=audit(org,actorUid,'isp.incident.create',ref.id,{segment:input.segment,severity:input.severity});
  const batch=db.batch();
  batch.create(ref,{title:input.title,description:input.description,segment:input.segment,severity:input.severity,status:'open',source:'manual',createdBy:actorUid,createdAt:stamp(),updatedAt:stamp()});
  batch.create(change.ref,change.data);
  await batch.commit(); return {id:ref.id,status:'open'};
});
export const updateIspIncidentStatus=callable(async request=>{
  const input=z.object({orgId:identifier,id:identifier,status:z.enum(['acknowledged','resolved']),note:optionalNote}).strict().parse(request.data);
  const {org,actorUid}=await requireIspOwner(request,input.orgId);
  const ref=org.collection('ispIncidents').doc(input.id);
  await db.runTransaction(async tx=>{
    const snapshot=await tx.get(ref);
    if(!snapshot.exists) throw new HttpsError('not-found','Incident not found');
    if(!canAdvanceIncident(snapshot.data().status,input.status)) throw new HttpsError('failed-precondition','Invalid incident state transition');
    const change=audit(org,actorUid,'isp.incident.status',input.id,{from:snapshot.data().status,to:input.status,note:input.note||''});
    tx.update(ref,{status:input.status,updatedAt:stamp(),...(input.status==='resolved'?{resolvedAt:stamp()}:{}),lastNote:input.note||'',updatedBy:actorUid});
    tx.create(change.ref,change.data);
  });
  return {ok:true};
});
export const createIspWorkOrder=callable(async request=>{
  const input=z.object({
    orgId:identifier,title:label,description,assignedTo:z.string().trim().min(2).max(120),
    priority:z.enum(['low','medium','high','urgent']), incidentId:identifier.optional()
  }).strict().parse(request.data);
  const {org,actorUid}=await requireIspOwner(request,input.orgId);
  if(input.incidentId && !(await org.collection('ispIncidents').doc(input.incidentId).get()).exists)
    throw new HttpsError('invalid-argument','Incident is not in this workspace');
  const ref=org.collection('ispWorkOrders').doc();
  const change=audit(org,actorUid,'isp.workorder.create',ref.id,{priority:input.priority});
  const batch=db.batch();
  batch.create(ref,{title:input.title,description:input.description,assignedTo:input.assignedTo,priority:input.priority,
    incidentId:input.incidentId||null,status:'open',createdBy:actorUid,createdAt:stamp(),updatedAt:stamp()});
  batch.create(change.ref,change.data);
  await batch.commit();return {id:ref.id,status:'open'};
});
export const updateIspWorkOrderStatus=callable(async request=>{
  const input=z.object({orgId:identifier,id:identifier,status:z.enum(['in_progress','closed']),note:optionalNote}).strict().parse(request.data);
  const {org,actorUid}=await requireIspOwner(request,input.orgId);
  const ref=org.collection('ispWorkOrders').doc(input.id);
  await db.runTransaction(async tx=>{
    const snapshot=await tx.get(ref);
    if(!snapshot.exists) throw new HttpsError('not-found','Work order not found');
    if(!canAdvanceWorkOrder(snapshot.data().status,input.status)) throw new HttpsError('failed-precondition','Invalid work order state transition');
    const change=audit(org,actorUid,'isp.workorder.status',input.id,{from:snapshot.data().status,to:input.status,note:input.note||''});
    tx.update(ref,{status:input.status,lastNote:input.note||'',updatedBy:actorUid,updatedAt:stamp()});
    tx.create(change.ref,change.data);
  });return {ok:true};
});
export const queueIspProvisioningRequest=callable(async request=>{
  const input=z.object({orgId:identifier,accountReference:label,
    serviceType:z.enum(['fiber','wireless']),packageMbps:z.number().int().min(1).max(1000),notes:optionalNote}).strict().parse(request.data);
  const {org,actorUid}=await requireIspOwner(request,input.orgId);
  const ref=org.collection('ispProvisioningRequests').doc();
  const change=audit(org,actorUid,'isp.provisioning.queue',ref.id,{serviceType:input.serviceType});
  const batch=db.batch();
  batch.create(ref,{accountReference:input.accountReference,serviceType:input.serviceType,packageMbps:input.packageMbps,
    notes:input.notes||'',status:'pending_manual_review',provisioned:false,
    createdBy:actorUid,createdAt:stamp(),updatedAt:stamp()});
  batch.create(change.ref,change.data);
  await batch.commit();
  return {id:ref.id,status:'pending_manual_review',provisioned:false};
});
