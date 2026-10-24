import './index.js';
import {randomUUID} from 'node:crypto';
import {getFirestore,FieldValue} from 'firebase-admin/firestore';
import {onCall,HttpsError} from 'firebase-functions/v2/https';
import {z} from 'zod';
import {transitionCloudJob} from './cloud_workflow_domain.js';
import {authorizeCloudAction} from './cloud_policy_domain.js';
import {computeInvoice} from '../../scripts/cloud-ops/billing.mjs';
const db=getFirestore(),region='europe-west1';
const id=z.string().regex(/^[a-zA-Z0-9_-]{10,128}$/);
const uuid=z.string().uuid();
const call=handler=>onCall({region,timeoutSeconds:60},async req=>{
 try{return await handler(req);}catch(e){
  if(e instanceof HttpsError)throw e;
  if(e instanceof z.ZodError)throw new HttpsError('invalid-argument','Invalid request');
  throw new HttpsError('failed-precondition','Cloud operation failed');
 }
});
async function access(req,action='read-metrics'){
 if(!req.auth)throw new HttpsError('unauthenticated','Sign in required');
 const orgId=id.parse(req.data?.orgId),org=db.collection('organizations').doc(orgId);
 const member=await org.collection('members').doc(req.auth.uid).get();
 const role=member.data()?.role;
 const check=authorizeCloudAction({actorOrgId:orgId,resourceOrgId:orgId,memberActive:member.exists,role},action);
 if(!check.allowed)throw new HttpsError('permission-denied','Not permitted');
 return {org,uid:req.auth.uid,role};
}
const payload=req=>{const {orgId,...data}=req.data||{};return data;};
const jobs=org=>org.collection('cloudJobs');
export const cloudCreateOperation=call(async req=>{
 const {org,uid}=await access(req,'approve-plan');
 const input=z.object({planId:uuid,kind:z.enum(['deployment','maintenance']),reason:z.string().trim().min(10).max(1000)}).strict().parse(payload(req));
 const plan=await org.collection('cloudAutomationPlans').doc(input.planId).get();
 if(!plan.exists||plan.data()?.state!=='approved_for_manual_setup')throw new HttpsError('failed-precondition','Plan not approved');
 const ref=jobs(org).doc(randomUUID());
 await ref.create({...input,state:'proposed',createdBy:uid,createdAt:FieldValue.serverTimestamp(),
    deploymentEnabled:false,customerApprovedBy:null,operatorApprovedBy:null});
 return {id:ref.id,state:'proposed',executed:false};
});
export const cloudAdvanceOperation=call(async req=>{
 const {org,uid}=await access(req,'approve-plan');
 const input=z.object({jobId:uuid,decision:z.enum(['validate','request_customer','approve_customer','approve_operator','reject']),
   budgetReviewed:z.boolean().optional()}).strict().parse(payload(req));
 const ref=jobs(org).doc(input.jobId);
 await db.runTransaction(async tx=>{
  const snap=await tx.get(ref);
  if(!snap.exists)throw new HttpsError('not-found','Job not found');
  const data=snap.data(),state=data.state;
  const next=({validate:'validated',request_customer:'awaiting_customer',
    approve_customer:'awaiting_operator',approve_operator:'queued',reject:'rejected'})[input.decision];
  if(input.decision==='approve_operator'){
    throw new HttpsError('failed-precondition','Operator approval is reserved for a separately authenticated platform operator; not enabled in this release');
  }
  if(false){
    if(data.customerApprovedBy===uid)throw new HttpsError('failed-precondition','Independent operator approval required');
    if(input.budgetReviewed!==true)throw new HttpsError('failed-precondition','Budget review required');
  }
  transitionCloudJob(state,next,{customerApproved:!!data.customerApprovedBy,
    operatorApproved:input.decision==='approve_operator',budgetReviewed:input.budgetReviewed===true});
  tx.update(ref,{state:next,updatedBy:uid,updatedAt:FieldValue.serverTimestamp(),
    ...(input.decision==='approve_customer'?{customerApprovedBy:uid}:{}),
    ...(input.decision==='approve_operator'?{operatorApprovedBy:uid,budgetReviewed:true}:{}),
    deploymentEnabled:false});
  const audit=org.collection('cloudAutomationAudit').doc();
  tx.create(audit,{action:'job.'+input.decision,jobId:ref.id,by:uid,at:FieldValue.serverTimestamp()});
 });
 return {ok:true,executed:false};
});
export const cloudListOperations=call(async req=>{
 const {org}=await access(req,'read-metrics');
 const snap=await jobs(org).orderBy('createdAt','desc').limit(50).get();
 return {jobs:snap.docs.map(x=>({id:x.id,...x.data(),createdAt:x.data().createdAt?.toDate?.()?.toISOString?.()||null}))};
});
export const cloudDraftServiceInvoice=call(async req=>{
 const {org,uid}=await access(req,'approve-plan');
 const input=z.object({planId:uuid,usageUsd:z.number().finite().min(0).max(1000000),
  markupPercent:z.number().finite().min(0).max(100),
  managedServiceKes:z.number().finite().min(0).max(100000000),
  exchangeKesPerUsd:z.number().finite().gt(0).max(10000)}).strict().parse(payload(req));
 const plan=await org.collection('cloudAutomationPlans').doc(input.planId).get();
 if(!plan.exists)throw new HttpsError('not-found','Plan not found');
 const values=computeInvoice(input);
 const ref=org.collection('cloudDraftInvoices').doc(randomUUID());
 await ref.create({...input,...values,source:'owner-entered-unreconciled',
   createdBy:uid,createdAt:FieldValue.serverTimestamp()});
 return {id:ref.id,...values,issued:false};
});
