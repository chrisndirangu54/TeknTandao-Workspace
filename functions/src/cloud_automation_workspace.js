import './index.js';
import {getFirestore,FieldValue} from 'firebase-admin/firestore';
import {onCall,HttpsError} from 'firebase-functions/v2/https';
import {identifier} from './domain.js';
import {draftCloudPlan} from './cloud_automation_planning.js';
const db=getFirestore(),region='europe-west1';
async function orgContext(req){
 if(!req.auth)throw new HttpsError('unauthenticated','Sign in first');
 const org=db.doc('organizations/'+identifier(req.data?.orgId));
 const member=await org.collection('members').doc(req.auth.uid).get();
 if(member.data()?.role!=='owner')throw new HttpsError('permission-denied','Workspace owner access required');
 return {org,uid:req.auth.uid};
}
export const previewCloudAutomationPlan=onCall({region},async req=>{
 await orgContext(req);
 try{return draftCloudPlan(req.data?.plan);}catch(e){throw new HttpsError('invalid-argument',e.message);}
});
export const importCloudAutomationPlan=onCall({region},async req=>{
 const {org,uid}=await orgContext(req);
 let result;
 try{result=draftCloudPlan(req.data?.plan);}catch(e){throw new HttpsError('invalid-argument',e.message);}
 const ref=org.collection('cloudAutomationPlans').doc();
 await ref.create({...result.plan,checklist:result.checklist,
  importedBy:uid,createdAt:FieldValue.serverTimestamp(),
  dynamics365Sync:'not_configured',resellerOrder:'not_submitted'});
 return {id:ref.id,imported:true,executed:false};
});
export const listCloudAutomationPlans=onCall({region},async req=>{
 const {org}=await orgContext(req);
 const snap=await org.collection('cloudAutomationPlans').orderBy('createdAt','desc').limit(50).get();
 return {plans:snap.docs.map(d=>({id:d.id,...d.data(),
  createdAt:d.data().createdAt?.toDate?.()?.toISOString?.()??null})),hasMore:snap.size===50};
});
