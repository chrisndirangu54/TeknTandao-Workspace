// Operator-reviewed ESET actions. Records requests only; never invokes ESET
// license purchases, endpoint remediation, policy changes, or incident resolution.
import './index.js';
import {getFirestore,FieldValue} from 'firebase-admin/firestore';
import {onCall,HttpsError} from 'firebase-functions/v2/https';
import {z} from 'zod';
import {identifier} from './domain.js';
import {isBootstrapSuperAdminToken} from './super_admin_domain.js';
const db=getFirestore(),region='europe-west1';
const actionSchema=z.object({
 kind:z.enum(['license_quote','license_renewal','endpoint_remediation_review',
  'policy_change_review','incident_resolution_review']),
 targetId:z.string().trim().min(3).max(128),
 reason:z.string().trim().min(12).max(1500),
 customerApproved:z.literal(true)
}).strict();
async function access(req,admin=false){
 if(!req.auth)throw new HttpsError('unauthenticated','Sign in');
 const orgId=identifier(req.data?.orgId);
 const snap=await db.doc('organizations/'+orgId+'/members/'+req.auth.uid).get();
 if(snap.data()?.role!=='owner')throw new HttpsError('permission-denied','Owner role required');
 if(admin&&!isBootstrapSuperAdminToken(req.auth.token||{}))
  throw new HttpsError('permission-denied','Platform operator approval required');
 return {orgId,uid:req.auth.uid};
}
export const requestEsetOperationReview=onCall({region,enforceAppCheck:true},async req=>{
 const {orgId,uid}=await access(req);
 const input=actionSchema.parse(req.data?.request);
 const cfg=(await db.doc('organizations/'+orgId+'/securityIntegrations/eset').get()).data()||{};
 if(cfg.connectApproved!==true)throw new HttpsError('failed-precondition','Approved ESET customer binding required');
 const ref=db.collection('organizations').doc(orgId).collection('esetOperations').doc();
 await ref.create({...input,id:ref.id,status:'awaiting_operator_review',
  requestedBy:uid,createdAt:FieldValue.serverTimestamp(),
  externalActionPerformed:false,commercialCommitment:false});
 return {id:ref.id,status:'awaiting_operator_review',externalActionPerformed:false};
});
export const listEsetOperationReviews=onCall({region,enforceAppCheck:true},async req=>{
 const {orgId}=await access(req);
 const docs=await db.collection('organizations').doc(orgId).collection('esetOperations')
  .orderBy('createdAt','desc').limit(50).get();
 return {requests:docs.docs.map(x=>({id:x.id,kind:x.data().kind,
    targetId:x.data().targetId,reason:x.data().reason,status:x.data().status,
    externalActionPerformed:false})),readOnly:true};
});
export const decideEsetOperationReview=onCall({region,enforceAppCheck:true},async req=>{
 const {orgId,uid}=await access(req,true);
 const id=identifier(req.data?.operationId);
 const decision=z.enum(['approved_for_manual_handling','rejected']).parse(req.data?.decision);
 const ref=db.doc('organizations/'+orgId+'/esetOperations/'+id);
 await db.runTransaction(async tx=>{
  const current=await tx.get(ref);
  if(!current.exists)throw new HttpsError('not-found','Operation not found');
  if(current.data()?.status!=='awaiting_operator_review')
   throw new HttpsError('failed-precondition','Operation already reviewed');
  tx.update(ref,{status:decision,reviewedBy:uid,
   reviewedAt:FieldValue.serverTimestamp(),externalActionPerformed:false});
 });
 return {status:decision,externalActionPerformed:false,
  nextStep:'Operator must separately verify ESET commercial and API permission before any external action.'};
});
