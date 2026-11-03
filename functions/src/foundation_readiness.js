// Bounded, tenant-authorized readiness snapshot. Metrics are sampled; never expose PII.
import {onCall,HttpsError} from 'firebase-functions/v2/https';
import {getFirestore} from 'firebase-admin/firestore';
import {foundationId,foundationMembershipAllows} from './foundation_domain.js';
const db=getFirestore();
export const foundationOperationalReadiness=onCall({region:'europe-west1'},async request=>{
  if(!request.auth?.uid)throw new HttpsError('unauthenticated','Sign in first');
  let orgId;
  try{orgId=foundationId(request.data?.orgId,'organization');}
  catch(e){throw new HttpsError('invalid-argument',e.message);}
  const org=db.collection('organizations').doc(orgId);
  const [parent,member]=await Promise.all([
    org.get(),org.collection('members').doc(request.auth.uid).get()
  ]);
  if(!parent.exists||member.data()?.role!=='owner'||
    !foundationMembershipAllows(member.data(),'write'))
    throw new HttpsError('permission-denied','Workspace owner required');
  const [pending,delivered,approvals,parties]=await Promise.all([
    org.collection('foundationOutbox').where('status','==','pending').limit(50).get(),
    org.collection('foundationOutbox').where('status','==','delivered').limit(50).get(),
    org.collection('foundationApprovals').where('status','==','pending').limit(50).get(),
    org.collection('enterpriseParties').limit(50).get()
  ]);
  const now=Date.now();
  const oldestAgeSeconds=pending.docs.reduce((max,d)=>{
    const age=d.data().createdAt?.toMillis?.();
    return age===undefined?max:Math.max(max,Math.max(0,Math.round((now-age)/1000)));
  },0);
  const result={tenantId:orgId,checkedAt:new Date(now).toISOString(),
    outbox:{pendingSample:pending.size,deliveredSample:delivered.size,
      oldestPendingAgeSeconds:oldestAgeSeconds,backlogCapped:pending.size===50},
    approvals:{pendingSample:approvals.size,capped:approvals.size===50},
    entities:{partySample:parties.size,capped:parties.size===50},
    health:{backlogWarning:pending.size>=50||oldestAgeSeconds>600},
    scope:'bounded-samples-not-full-counts'
  };
  console.info('foundation.readiness.sample',{
    tenantId:orgId,backlogWarning:result.health.backlogWarning,
    pendingSample:pending.size,oldestPendingAgeSeconds
  });
  return result;
});
