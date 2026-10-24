import './index.js';
import {randomUUID} from 'node:crypto';
import {getFirestore, FieldValue} from 'firebase-admin/firestore';
import {onCall, HttpsError} from 'firebase-functions/v2/https';
import {z} from 'zod';
import {validateCloudMigrationRequest, proposeCloudAutomationSteps} from './cloud_migration_contract.js';
import {generateCloudBlueprint, assessCloudSignals} from './cloud_planning_domain.js';
import {authorizeCloudAction} from './cloud_policy_domain.js';

const db=getFirestore(), region='europe-west1';
const orgIdSchema=z.string().regex(/^[A-Za-z0-9_-]{10,128}$/);
function callable(fn){return onCall({region,timeoutSeconds:60,enforceAppCheck:false},async req=>{
 try{return await fn(req);}catch(e){
 if(e instanceof HttpsError)throw e;
 if(e instanceof z.ZodError)throw new HttpsError('invalid-argument','Invalid cloud automation request');
 throw new HttpsError('invalid-argument','Cloud automation request could not be processed');
 }});}
async function authorized(req,action='read-metrics'){
 if(!req.auth)throw new HttpsError('unauthenticated','Please sign in');
 const orgId=orgIdSchema.parse(req.data?.orgId);
 const org=db.collection('organizations').doc(orgId);
 const member=await org.collection('members').doc(req.auth.uid).get();
 const role=member.data()?.role;
 const policy=authorizeCloudAction({actorOrgId:orgId,resourceOrgId:orgId,
   memberActive:member.exists,role},action);
 if(!policy.allowed)throw new HttpsError('permission-denied','Cloud action denied by workspace policy');
 return {org,uid:req.auth.uid};
}
const payload=req=>{const {orgId,...data}=req.data||{};return data;};
const plans=org=>org.collection('cloudAutomationPlans');
export const cloudImportMigrationPlan=callable(async req=>{
 const {org,uid}=await authorized(req,'import-plan');
 const plan=validateCloudMigrationRequest(req.data?.plan);
 const ref=plans(org).doc(randomUUID());
 await ref.create({...plan,steps:proposeCloudAutomationSteps(req.data.plan),
  state:'awaiting_review',deploymentEnabled:false,createdBy:uid,createdAt:FieldValue.serverTimestamp()});
 await org.collection('cloudAutomationAudit').add({action:'plan.import',planId:ref.id,by:uid,at:FieldValue.serverTimestamp()});
 return {ok:true,id:ref.id,state:'awaiting_review',deployed:false};
});
export const cloudListMigrationPlans=callable(async req=>{
 const {org}=await authorized(req);
 const snapshot=await plans(org).orderBy('createdAt','desc').limit(50).get();
 return {plans:snapshot.docs.map(d=>({id:d.id,...d.data(),createdAt:d.data().createdAt?.toDate?.()?.toISOString?.()??null}))};
});
export const cloudReviewMigrationPlan=callable(async req=>{
 const {org,uid}=await authorized(req,'approve-plan');
 const input=z.object({planId:z.string().uuid(),decision:z.enum(['approve','reject'])}).strict().parse(payload(req));
 const ref=plans(org).doc(input.planId);
 await db.runTransaction(async tx=>{
 const doc=await tx.get(ref);
 if(!doc.exists)throw new HttpsError('not-found','Plan not found');
 if(doc.data().state!=='awaiting_review')throw new HttpsError('failed-precondition','Plan already reviewed');
 tx.update(ref,{state:input.decision==='approve'?'approved_for_manual_setup':'rejected',reviewedBy:uid,
  reviewedAt:FieldValue.serverTimestamp(),deploymentEnabled:false});
 });
 await org.collection('cloudAutomationAudit').add({action:'plan.'+input.decision,planId:ref.id,by:uid,at:FieldValue.serverTimestamp()});
 return {ok:true,executionEnabled:false};
});
// No service principals, third-party API tokens, or remote execution are accepted here.
// Approval records planning consent only: provisioning remains disabled.

export const cloudPreviewPlan=callable(async req=>{
 const {org,uid}=await authorized(req,'preview-deployment');
 const input=z.object({planId:z.string().uuid()}).strict().parse(payload(req));
 const snap=await plans(org).doc(input.planId).get();
 if(!snap.exists)throw new HttpsError('not-found','Plan not found');
 const blueprint=generateCloudBlueprint(snap.data());
 await org.collection('cloudAutomationAudit').add({action:'plan.preview',planId:input.planId,by:uid,at:FieldValue.serverTimestamp()});
 return {blueprint,cloudChangesMade:false};
});
export const cloudAssessMonitoring=callable(async req=>{
 const {org,uid}=await authorized(req);
 const input=z.object({planId:z.string().uuid(),signals:z.array(z.object({
   metric:z.enum(['cpuPercent','memoryPercent','errorRatePercent','monthlySpendPercent','backupAgeHours']),
   value:z.number().finite().min(0).max(100000)
 }).strict()).max(100)}).strict().parse(payload(req));
 const snap=await plans(org).doc(input.planId).get();
 if(!snap.exists)throw new HttpsError('not-found','Plan not found');
 const results=assessCloudSignals(input.signals);
 const ref=org.collection('cloudAssessments').doc(randomUUID());
 await ref.create({planId:input.planId,results,source:'manual-observations',createdBy:uid,createdAt:FieldValue.serverTimestamp()});
 return {id:ref.id,results,remediationPerformed:false};
});
