import {onCall, HttpsError} from 'firebase-functions/v2/https';
import {getFirestore, FieldValue} from 'firebase-admin/firestore';
import {identifier, canAccess} from './domain.js';

const region='europe-west1';
const db=()=>getFirestore();
const stamp=()=>FieldValue.serverTimestamp();
const tasks=new Set(['clinical_summary','diagnostic_considerations','questions_to_check','lab_review','evidence_review']);
const models=Object.freeze({
  'medgemma-1.5-4b':{provider:'Google Health AI Developer Foundations',model:'MedGemma 1.5 4B',
    card:'https://developers.google.com/health-ai-developer-foundations/medgemma/model-card',
    clinicalApproved:false},
  'medgemma-27b':{provider:'Google Health AI Developer Foundations',model:'MedGemma 27B',
    card:'https://developers.google.com/health-ai-developer-foundations/medgemma/model-card-v1',
    clinicalApproved:false},
});
function field(v,max=300){if(typeof v!=='string'||!v.trim()||v.length>max)throw new HttpsError('invalid-argument','Invalid field');return v.trim();}
async function context(request){
  if(!request.auth?.uid)throw new HttpsError('unauthenticated','Sign in required');
  const orgId=identifier(request.data?.orgId);
  const org=db().collection('organizations').doc(orgId);
  const [app,member]=await Promise.all([
    org.collection('apps').doc('hospital').get(),
    org.collection('members').doc(request.auth.uid).get()
  ]);
  const install=app.data();
  if(!install || !(install.expiresAt?.toMillis()>Date.now()) ||
      !canAccess(member.data(),'hospital',install)){
    throw new HttpsError('permission-denied','Active hospital staff membership required');
  }
  const staff=member.data()||{};
  return {org,orgId,uid:request.auth.uid,staff};
}
async function assertClinician(org,uid){
  const staff=(await org.collection('hospitalClinicalStaff').doc(uid).get()).data();
  if(!staff || staff.verified!==true || !['doctor','clinicalOfficer','specialist'].includes(staff.role))
    throw new HttpsError('permission-denied','Verified clinician authorization required');
}
async function requirePatientAccess(org,uid,patientId){
  const patient=await org.collection('patients').doc(patientId).get();
  if(!patient.exists)throw new HttpsError('not-found','Patient not found');
  const access=(await org.collection('hospitalClinicalConsents').doc(patientId+'_'+uid).get()).data();
  if(!access || access.revokedAt || access.granted!==true ||
      !Array.isArray(access.scopes)||!access.scopes.includes('clinical.ai.assist') ||
      (access.expiresAt?.toMillis && access.expiresAt.toMillis()<=Date.now())){
    throw new HttpsError('permission-denied','Explicit patient-scoped clinical AI consent required');
  }
}
async function audit(org,uid,action,details){
  await org.collection('hospitalClinicalAudit').add({actorId:uid,action,details,createdAt:stamp()});
}
export const hospitalClinicalAiOverview=onCall({region},async request=>{
  const {org,uid}=await context(request);await assertClinician(org,uid);
  return {modelRegistry:models,clinicalApproval:false,
    inferenceEnabled:false, imageAndMicrobiologyValidated:false,
    literatureStatus:'approved-evidence-catalogue-only',
    hospitalInteroperability:'authorization-required',
    clinicianReviewRequired:true};
});
export const hospitalClinicalAiSubmitReview=onCall({region},async request=>{
  const {org,uid}=await context(request);await assertClinician(org,uid);
  const patientId=identifier(request.data?.patientId);
  await requirePatientAccess(org,uid,patientId);
  const task=field(request.data?.task,60),modelId=field(request.data?.modelId,60);
  if(!tasks.has(task)||!Object.hasOwn(models,modelId))
    throw new HttpsError('invalid-argument','Unsupported task or model');
  // No client-supplied raw chart or clinical free text is transmitted to a model.
  const evidenceIds=request.data?.evidenceIds||[];
  if(!Array.isArray(evidenceIds)||evidenceIds.length>8)
    throw new HttpsError('invalid-argument','Too many references');
  const evidence=[];
  for(const id of evidenceIds){
    const d=(await org.collection('hospitalEvidence').doc(identifier(id)).get()).data();
    if(!d||d.approved!==true||d.withdrawn===true)
      throw new HttpsError('failed-precondition','Reference not approved');
    evidence.push({id,title:d.title,url:d.url});
  }
  const ref=await org.collection('hospitalClinicalAiReviews').add({
    patientId,task,modelId,requestedBy:uid,referenceIds:evidence.map(e=>e.id),
    status:'pendingClinicianEvidenceReview',modelInferencePerformed:false,
    autoDiagnosis:false,autoPrescribing:false,createdAt:stamp()
  });
  await audit(org,uid,'hospital.ai.review.request',{patientId,reviewId:ref.id,modelId,task});
  return {reviewId:ref.id,status:'pendingClinicianEvidenceReview',
    model:models[modelId],references:evidence,
    message:'Clinical research AI requires independently validated model serving; no diagnosis generated.'};
});
export const hospitalClinicalAiRegisterEvidence=onCall({region},async request=>{
  const {org,uid}=await context(request);await assertClinician(org,uid);
  const title=field(request.data?.title,180),url=field(request.data?.url,500);
  const publisher=field(request.data?.publisher,100),version=field(request.data?.version,80);
  let parsed;try{parsed=new URL(url);}catch{throw new HttpsError('invalid-argument','Invalid reference URL');}
  if(parsed.protocol!=='https:'||parsed.username||parsed.password)
    throw new HttpsError('invalid-argument','HTTPS source required');
  const ref=await org.collection('hospitalEvidence').add({
    title,url,publisher,version,submittedBy:uid,approved:false,withdrawn:false,
    status:'pendingIndependentReview',createdAt:stamp()
  });
  await audit(org,uid,'hospital.evidence.register',{evidenceId:ref.id});
  return {evidenceId:ref.id,status:'pendingIndependentReview'};
});
export const hospitalClinicalAiListEvidence=onCall({region},async request=>{
  const {org,uid}=await context(request);await assertClinician(org,uid);
  const snap=await org.collection('hospitalEvidence').where('approved','==',true).limit(60).get();
  return {references:snap.docs.filter(d=>d.data().withdrawn!==true).map(d=>({
    id:d.id,title:d.data().title,url:d.data().url,publisher:d.data().publisher,
    version:d.data().version
  }))};
});
export const hospitalClinicalAiRecordEvaluation=onCall({region},async request=>{
  const {org,uid}=await context(request);await assertClinician(org,uid);
  const domain=field(request.data?.domain,60);
  if(!['radiology','microscopy','antimicrobial_susceptibility','medgemma_reasoning'].includes(domain))
    throw new HttpsError('invalid-argument','Invalid evaluation domain');
  const dataset=field(request.data?.datasetReference,200);
  const score=request.data?.clinicianScore;
  if(!Number.isFinite(score)||score<0||score>1)
    throw new HttpsError('invalid-argument','Score must be between 0 and 1');
  const ref=await org.collection('hospitalAiEvaluations').add({
    domain,datasetReference:dataset,clinicianScore:score,
    externalValidationConfirmed:false,clinicalApproval:false,
    evaluatorId:uid,createdAt:stamp()
  });
  await audit(org,uid,'hospital.ai.evaluation.record',{evaluationId:ref.id,domain});
  return {evaluationId:ref.id,clinicalApproval:false};
});
