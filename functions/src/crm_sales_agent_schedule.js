import './index.js';
import {getFirestore,FieldValue,FieldPath} from 'firebase-admin/firestore';
import {onCall,HttpsError} from 'firebase-functions/v2/https';
import {onSchedule} from 'firebase-functions/v2/scheduler';
import {crmSalesRecommendations} from './crm_sales_agent_domain.js';
const db=getFirestore();
const region='europe-west1';
const stamp=()=>FieldValue.serverTimestamp();
const validId=s=>typeof s==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(s);
async function owner(request){
 if(!request.auth)throw new HttpsError('unauthenticated','Sign in first');
 const orgId=request.data?.orgId;
 if(!validId(orgId))throw new HttpsError('invalid-argument','Invalid organization');
 const org=db.collection('organizations').doc(orgId);
 const member=(await org.collection('members').doc(request.auth.uid).get()).data();
 if(member?.role!=='owner')throw new HttpsError('permission-denied','Workspace owner required');
 return {org,user:request.auth.uid};
}
export const configureCrmSalesAgentSchedule=onCall({region},async request=>{
 const {org,user}=await owner(request);
 const enabled=request.data?.enabled;
 if(typeof enabled!=='boolean')throw new HttpsError('invalid-argument','enabled must be boolean');
 await org.collection('crmAgentSettings').doc('daily').set({
  enabled,mode:'read_only',ownerUid:user,updatedAt:stamp(),
 },{merge:true});
 return {enabled,mode:'read_only'};
});
export const runScheduledCrmSalesAgent=onSchedule({
 schedule:'every day 08:00',timeZone:'Africa/Nairobi',region,timeoutSeconds:540
},async()=>{
 const configs=await db.collectionGroup('crmAgentSettings').where('enabled','==',true).limit(51).get();
 if(configs.size>50)throw new Error('Scheduled agent tenant cap exceeded; paginate before increasing');
 const date=new Date().toISOString().slice(0,10);
 for(const settingsDoc of configs.docs){
  if(settingsDoc.id!=='daily')continue;
  const org=settingsDoc.ref.parent.parent;
  if(!org||org.parent.id!=='organizations')continue;
  const runRef=org.collection('crmSalesAgentRuns').doc('scheduled_'+date);
  const claimed=await db.runTransaction(async tx=>{
   const existing=await tx.get(runRef);
   if(existing.exists)return false;
   tx.create(runRef,{status:'running',mode:'scheduled_read_only',createdAt:stamp()});
   return true;
  });
  if(!claimed)continue;
  try{
   const [deals,tasks]=await Promise.all([
    org.collection('crmOpportunities').orderBy(FieldPath.documentId()).limit(501).get(),
    org.collection('crmFollowUps').orderBy(FieldPath.documentId()).limit(501).get()
   ]);
   if(deals.size>500||tasks.size>500)throw new Error('Workspace needs paginated scheduled scan');
   const result=crmSalesRecommendations(
    deals.docs.map(d=>({id:d.id,...d.data()})),
    tasks.docs.map(d=>({id:d.id,...d.data()})),new Date().toISOString(),25);
   await runRef.update({status:'completed',completedAt:stamp(),flagged:result.totalFlagged,
    recommendationIds:result.recommendations.map(r=>r.opportunityId),
    analyzedOpportunities:result.analyzedOpportunities,analyzedFollowUps:result.analyzedFollowUps});
  }catch(error){
   await runRef.update({status:'failed',failedAt:stamp(),error:'Scheduled CRM analysis failed; review run and retry manually'});
  }
 }
});
