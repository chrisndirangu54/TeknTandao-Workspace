// Enterprise branch directory, scoped under existing Firestore organizations.
import {onCall,HttpsError} from 'firebase-functions/v2/https';
import {getFirestore,FieldValue} from 'firebase-admin/firestore';
import {createHash} from 'node:crypto';
import {foundationId,foundationIdempotencyKey,foundationMembershipAllows} from './foundation_domain.js';
import {foundationBranchInput} from './foundation_event_domain.js';

const db=getFirestore();
const region='europe-west1';
function requireAuth(request){
  if(!request.auth?.uid)throw new HttpsError('unauthenticated','Sign in first');
  return request.auth.uid;
}
async function check(org,uid,operation){
  const [parent,member]=await Promise.all([org.get(),org.collection('members').doc(uid).get()]);
  if(!parent.exists||!foundationMembershipAllows(member.data(),operation))
    throw new HttpsError('permission-denied','Workspace access denied');
}
export const foundationCreateBranch=onCall({region},async request=>{
  const uid=requireAuth(request);
  let orgId,input,key;
  try{
    orgId=foundationId(request.data?.orgId,'organization');
    input=foundationBranchInput(request.data?.branch);
    key=foundationIdempotencyKey(request.data?.idempotencyKey);
  }catch(e){throw new HttpsError('invalid-argument',e.message);}
  const org=db.collection('organizations').doc(orgId);
  const branch=org.collection('foundationBranches').doc();
  const receipt=org.collection('foundationIdempotency')
    .doc(createHash('sha256').update('branch:'+uid+':'+key).digest('hex'));
  const fingerprint=createHash('sha256').update(JSON.stringify(input)).digest('hex');
  const output=await db.runTransaction(async tx=>{
    const [parent,member,prior]=await Promise.all([
      tx.get(org),tx.get(org.collection('members').doc(uid)),tx.get(receipt)
    ]);
    if(!parent.exists||!foundationMembershipAllows(member.data(),'write'))
      throw new HttpsError('permission-denied','Workspace access denied');
    if(prior.exists){
      if(prior.data().fingerprint!==fingerprint)
        throw new HttpsError('already-exists','Idempotency key reused with different payload');
      return {id:prior.data().branchId,replayed:true};
    }
    tx.create(branch,{...input,tenantId:orgId,createdBy:uid,
      createdAt:FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp()});
    tx.create(receipt,{branchId:branch.id,fingerprint,createdAt:FieldValue.serverTimestamp()});
    tx.create(org.collection('foundationAudit').doc(),{
      tenantId:orgId,action:'enterprise.branch.create',actorUid:uid,
      resourceId:branch.id,createdAt:FieldValue.serverTimestamp()
    });
    return {id:branch.id,replayed:false};
  });
  return {...output,tenantId:orgId};
});
export const foundationListBranches=onCall({region},async request=>{
  const uid=requireAuth(request);
  let orgId;
  try{orgId=foundationId(request.data?.orgId,'organization');}
  catch(e){throw new HttpsError('invalid-argument',e.message);}
  const org=db.collection('organizations').doc(orgId);
  await check(org,uid,'read');
  const limit=request.data?.limit??25;
  if(!Number.isInteger(limit)||limit<1||limit>100)
    throw new HttpsError('invalid-argument','Limit must be 1-100');
  const snapshot=await org.collection('foundationBranches').orderBy('createdAt','desc')
    .limit(limit).get();
  return {tenantId:orgId,items:snapshot.docs.map(d=>({
    id:d.id,name:d.data().name,code:d.data().code??null
  }))};
});
export const foundationOutboxStatus=onCall({region},async request=>{
  const uid=requireAuth(request);
  let orgId;
  try{orgId=foundationId(request.data?.orgId,'organization');}
  catch(e){throw new HttpsError('invalid-argument',e.message);}
  const org=db.collection('organizations').doc(orgId);
  await check(org,uid,'write');
  const [pending,delivered]=await Promise.all([
    org.collection('foundationOutbox').where('status','==','pending').limit(101).get(),
    org.collection('foundationOutbox').where('status','==','delivered').limit(101).get()
  ]);
  return {tenantId:orgId,pendingSample:Math.min(100,pending.size),
    deliveredSample:Math.min(100,delivered.size),capped:pending.size>100||delivered.size>100};
});
