// Independent approval for gateway disconnect requests.
// An approval schedules work; it never executes network commands.
import {randomUUID} from 'node:crypto';
import {getFirestore,FieldValue} from 'firebase-admin/firestore';
import {onCall,HttpsError} from 'firebase-functions/v2/https';
const fail=(code,message)=>{throw new HttpsError(code,message);};
const valid=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{5,100}$/.test(x);
const call=fn=>onCall({region:'europe-west1',timeoutSeconds:40},fn);
export const hotspotV2ApproveDisconnect=call(async req=>{
 if(!req.auth)fail('unauthenticated','Sign-in required');
 const data=req.data;
 if(!data||Object.keys(data).some(k=>!['orgId','voucherId'].includes(k))||!valid(data.orgId)||!valid(data.voucherId))
  fail('invalid-argument','Invalid request');
 const db=getFirestore(),org=db.collection('organizations').doc(data.orgId);
 const membership=await org.collection('members').doc(req.auth.uid).get();
 if(!membership.exists||!['owner','admin'].includes(membership.data().role))
  fail('permission-denied','Administrator required');
 const root=org.collection('hotspotV2').doc('control');
 const ref=root.collection('gatewayRequests').doc('disconnect_'+data.voucherId);
 const audit=root.collection('audit').doc(randomUUID());
 await db.runTransaction(async tx=>{
  const request=await tx.get(ref);
  if(!request.exists||request.data().state!=='awaiting_independent_approval')
   fail('failed-precondition','Not awaiting approval');
  if(request.data().requestedBy===req.auth.uid)fail('permission-denied','Request author cannot approve');
  const voucher=await tx.get(root.collection('vouchers').doc(data.voucherId));
  if(!voucher.exists||voucher.data().state!=='revoked')fail('failed-precondition','Voucher not revoked');
  tx.update(ref,{state:'approved_not_executed',approvedBy:req.auth.uid,
    approvedAt:FieldValue.serverTimestamp(),executed:false});
  tx.create(audit,{actor:req.auth.uid,action:'disconnect_approved',resource:ref.id,createdAt:FieldValue.serverTimestamp()});
 });
 return {approved:true,executed:false,routerConnected:false};
});

export const hotspotV2ListDisconnectApprovals=call(async req=>{
 if(!req.auth)fail('unauthenticated','Sign-in required');
 const data=req.data;
 if(!data||Object.keys(data).some(k=>k!=='orgId')||!valid(data.orgId))
   fail('invalid-argument','Invalid organization');
 const db=getFirestore(),org=db.collection('organizations').doc(data.orgId);
 const membership=await org.collection('members').doc(req.auth.uid).get();
 if(!membership.exists||!['owner','admin'].includes(membership.data().role))
   fail('permission-denied','Administrator required');
 const requests=await org.collection('hotspotV2').doc('control').collection('gatewayRequests').limit(100).get();
 return {records:requests.docs.map(d=>({id:d.id,voucherId:d.data().voucherId,
   siteId:d.data().siteId,operation:d.data().operation,state:d.data().state,
   requestedBy:d.data().requestedBy,approvedBy:d.data().approvedBy||null,
   executed:d.data().executed===true})),limit:100,liveCommands:false};
});
