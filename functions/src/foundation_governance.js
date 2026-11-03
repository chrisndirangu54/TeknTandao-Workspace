// Owner-managed, auditable approval gate and read-only legacy migration inventory.
import {onCall,HttpsError} from 'firebase-functions/v2/https';
import {getFirestore,FieldValue} from 'firebase-admin/firestore';
import {foundationId,foundationMembershipAllows} from './foundation_domain.js';
import {approvalInput,approvalDecision,migrationAssessment} from './foundation_governance_domain.js';

const db=getFirestore(),region='europe-west1';
const callable=handler=>onCall({region},async request=>{
  if(!request.auth?.uid)throw new HttpsError('unauthenticated','Sign in first');
  try{return await handler(request);}
  catch(e){
    if(e instanceof HttpsError)throw e;
    if(e instanceof Error&&/^(Invalid |Approval |Self approval)/.test(e.message))
      throw new HttpsError('failed-precondition',e.message);
    console.error('foundation.governance.failed',{name:e?.name||'Error'});
    throw new HttpsError('internal','Governance operation failed');
  }
});
function resolveOrg(input){
  try{return db.collection('organizations').doc(foundationId(input,'organization'));}
  catch(e){throw new HttpsError('invalid-argument',e.message);}
}
async function requireOwner(org,uid){
  const [parent,membership]=await Promise.all([org.get(),org.collection('members').doc(uid).get()]);
  if(!parent.exists || membership.data()?.role!=='owner' ||
      !foundationMembershipAllows(membership.data(),'write'))
    throw new HttpsError('permission-denied','Workspace owner required');
}
export const foundationRequestApproval=callable(async request=>{
  const uid=request.auth.uid,org=resolveOrg(request.data?.orgId);
  let input;
  try{input=approvalInput(request.data?.approval);}
  catch(e){throw new HttpsError('invalid-argument',e.message);}
  const ref=org.collection('foundationApprovals').doc();
  await db.runTransaction(async tx=>{
    const [parent,member]=await Promise.all([
      tx.get(org),tx.get(org.collection('members').doc(uid))
    ]);
    if(!parent.exists||member.data()?.role!=='owner'||
        !foundationMembershipAllows(member.data(),'write'))
      throw new HttpsError('permission-denied','Workspace owner required');
    const now=Date.now();
    tx.create(ref,{...input,tenantId:org.id,status:'pending',createdBy:uid,
      createdAt:FieldValue.serverTimestamp(),expiresAt:new Date(now+24*3600000).toISOString()});
    tx.create(org.collection('foundationAudit').doc(),{
      tenantId:org.id,actorUid:uid,action:'foundation.approval.request',
      resourceId:ref.id,createdAt:FieldValue.serverTimestamp()});
  });
  return {id:ref.id,status:'pending',executed:false};
});
export const foundationDecideApproval=callable(async request=>{
  const uid=request.auth.uid,org=resolveOrg(request.data?.orgId);
  let approvalId;
  try{approvalId=foundationId(request.data?.approvalId,'approval');}
  catch(e){throw new HttpsError('invalid-argument',e.message);}
  const decision=request.data?.decision;
  const ref=org.collection('foundationApprovals').doc(approvalId);
  const result=await db.runTransaction(async tx=>{
    const [parent,member,snapshot]=await Promise.all([
      tx.get(org),tx.get(org.collection('members').doc(uid)),tx.get(ref)
    ]);
    if(!parent.exists||member.data()?.role!=='owner'||
        !foundationMembershipAllows(member.data(),'write'))
      throw new HttpsError('permission-denied','Workspace owner required');
    if(!snapshot.exists)throw new HttpsError('not-found','Approval not found');
    const next=approvalDecision(snapshot.data(),{actorUid:uid,decision});
    tx.update(ref,{...next,decidedAt:FieldValue.serverTimestamp()});
    tx.create(org.collection('foundationAudit').doc(),{
      tenantId:org.id,actorUid:uid,action:'foundation.approval.'+next.status,
      resourceId:ref.id,createdAt:FieldValue.serverTimestamp()});
    return next;
  });
  return {id:ref.id,status:result.status,executed:false};
});
export const foundationListApprovals=callable(async request=>{
  const org=resolveOrg(request.data?.orgId);
  await requireOwner(org,request.auth.uid);
  const snapshot=await org.collection('foundationApprovals').limit(50).get();
  return {items:snapshot.docs.map(d=>({
    id:d.id,kind:d.data().kind,status:d.data().status,
    summary:d.data().summary,targetId:d.data().targetId,
    createdBy:d.data().createdBy,expiresAt:d.data().expiresAt
  })),capped:snapshot.size===50};
});
// Analysis only: never writes migrated entities or exports raw personal records.
export const foundationAssessLegacyContacts=callable(async request=>{
  const org=resolveOrg(request.data?.orgId);
  await requireOwner(org,request.auth.uid);
  const cap=200;
  const snapshot=await org.collection('contacts').limit(cap).get();
  let missingName=0,externalReferences=0;
  for(const d of snapshot.docs){
    const x=d.data();
    if(!(typeof x.name==='string'&&x.name.trim()) &&
       !(typeof x.displayName==='string'&&x.displayName.trim()))missingName++;
    if(typeof x.externalRef==='string'&&x.externalRef.trim())externalReferences++;
  }
  const assessment=migrationAssessment({
    scanned:snapshot.size,missingName,externalReferences,cap
  });
  console.info('foundation.migration.assessed',{
    tenantId:org.id,actorUid:request.auth.uid,...assessment
  });
  return {tenantId:org.id,source:'contacts',...assessment};
});
