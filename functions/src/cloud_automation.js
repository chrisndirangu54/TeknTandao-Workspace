import './index.js';
import {randomUUID} from 'node:crypto';
import {getFirestore, FieldValue} from 'firebase-admin/firestore';
import {onCall, HttpsError} from 'firebase-functions/v2/https';
import {z} from 'zod';
import {validateCloudMigrationRequest, proposeCloudAutomationSteps} from './cloud_migration_contract.js';

const db=getFirestore(), region='europe-west1';
const orgIdSchema=z.string().regex(/^[A-Za-z0-9_-]{10,128}$/);
function callable(fn){return onCall({region,timeoutSeconds:60,enforceAppCheck:false},async req=>{
 try{return await fn(req);}catch(e){
 if(e instanceof HttpsError)throw e;
 if(e instanceof z.ZodError)throw new HttpsError('invalid-argument','Invalid cloud automation request');
 throw new HttpsError('invalid-argument','Cloud automation request could not be processed');
 }});}
async function authorized(req){
 if(!req.auth)throw new HttpsError('unauthenticated','Please sign in');
 const orgId=orgIdSchema.parse(req.data?.orgId);
 const org=db.collection('organizations').doc(orgId);
 const member=await org.collection('members').doc(req.auth.uid).get();
 if(!member.exists || member.data()?.role!=='owner')throw new HttpsError('permission-denied','Workspace owner access required');
 return {org,uid:req.auth.uid};
}
const plans=org=>org.collection('cloudAutomationPlans');
export const cloudImportMigrationPlan=callable(async req=>{
 const {org,uid}=await authorized(req);
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
 const {org,uid}=await authorized(req);
 const input=z.object({planId:z.string().uuid(),decision:z.enum(['approve','reject'])}).strict().parse(req.data);
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
