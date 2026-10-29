import './index.js';
import {getFirestore,FieldValue} from 'firebase-admin/firestore';
import {onCall,HttpsError} from 'firebase-functions/v2/https';
import {z} from 'zod';
import {identifier} from './domain.js';
import {isBootstrapSuperAdminToken} from './super_admin_domain.js';
const db=getFirestore(), region='europe-west1';
const stages=['lead','qualification','application','verification','approved','provisioning','active','blocked'];
const providers=['microsoft','google','aws','td_africa','other'];
const schema=z.object({
 company:z.string().trim().min(2).max(160),
 contactEmail:z.email().max(254),
 program:z.enum(providers),
 stage:z.enum(stages).default('lead'),
 partnerReference:z.string().max(120).default(''),
 notes:z.string().max(2000).default(''),
 dynamicsAccountId:z.string().regex(/^[0-9a-fA-F-]{36}$/).optional(),
}).strict();
async function context(req){
 if(!req.auth)throw new HttpsError('unauthenticated','Sign in first');
 const orgId=identifier(req.data?.orgId),org=db.doc('organizations/'+orgId);
 const member=await org.collection('members').doc(req.auth.uid).get();
 if(member.data()?.role!=='owner'||!isBootstrapSuperAdminToken(req.auth.token||{}))
  throw new HttpsError('permission-denied','Reseller administrator role required');
 const approved=await db.doc('resellerAccounts/'+orgId).get();
 if(approved.data()?.enabled!==true)throw new HttpsError('permission-denied','Reseller access not enabled');
 return {org,uid:req.auth.uid};
}
export const getResellerOnboardingDashboard=onCall({region},async req=>{
 const {org}=await context(req);
 const snap=await org.collection('resellerOnboarding').orderBy('createdAt','desc').limit(100).get();
 const records=snap.docs.map(x=>({id:x.id,...x.data(),createdAt:x.data().createdAt?.toDate?.()?.toISOString?.()??null}));
 const stagesSummary=Object.fromEntries(stages.map(stage=>[stage,records.filter(x=>x.stage===stage).length]));
 return {records,stages:stagesSummary,isPartial:snap.size===100,
  dynamics365:{connected:false,writeSyncEnabled:false,note:'Connect a Dynamics 365 account in Automation Studio; automatic CRM writes require explicit mapping and authorization.'}};
});
export const createResellerOnboarding=onCall({region},async req=>{
 const {org,uid}=await context(req);
 const values=schema.parse(req.data?.record);
 const ref=org.collection('resellerOnboarding').doc();
 await ref.create({...values,createdBy:uid,createdAt:FieldValue.serverTimestamp(),
  updatedAt:FieldValue.serverTimestamp(),syncState:'not_connected',source:'workspace'});
 return {id:ref.id,stage:values.stage,dynamicsSynced:false};
});
export const updateResellerOnboardingStage=onCall({region},async req=>{
 const {org,uid}=await context(req);
 const ref=org.collection('resellerOnboarding').doc(identifier(req.data?.id));
 const stage=z.enum(stages).parse(req.data?.stage);
 await db.runTransaction(async tx=>{
  const current=await tx.get(ref);
  if(!current.exists)throw new HttpsError('not-found','Reseller onboarding record not found');
  const previous=current.data().stage;
  if(previous==='active'&&stage!=='blocked')
   throw new HttpsError('failed-precondition','Active program cannot be reset without review');
  if(stage==='active'&&previous!=='provisioning')
   throw new HttpsError('failed-precondition','Provisioning review must precede activation');
  tx.update(ref,{stage,updatedBy:uid,updatedAt:FieldValue.serverTimestamp()});
 });
 return {id:ref.id,stage,externalAccountProvisioned:false};
});
