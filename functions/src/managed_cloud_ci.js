// TeknTandao Managed Cloud: tenant-owned GitHub deployments and signed CI status ingestion.
// Customer code builds ONLY inside customer-controlled GitHub Actions and isolated GCP projects.
// Workspace Firebase Functions never run, clone, compile or execute untrusted customer code.
import './index.js';
import {randomUUID,randomBytes} from 'node:crypto';
import {getFirestore,FieldValue} from 'firebase-admin/firestore';
import {onCall,onRequest,HttpsError} from 'firebase-functions/v2/https';
import {z} from 'zod';
import {identifier} from './domain.js';
import {serviceSchema,runSignalSchema,normalizedRepository,hashIngestionToken,verifyIngestionToken,computeCloudInsights} from './managed_cloud_domain.js';
import {isCloudServicePaid,decideManagedCloudDeployment} from './managed_cloud_billing_domain.js';

const db=getFirestore(),region='europe-west1';
async function owner(req){
 if(!req.auth)throw new HttpsError('unauthenticated','Sign in first');
 const orgId=identifier(req.data?.orgId);
 const org=db.doc('organizations/'+orgId);
 const member=await org.collection('members').doc(req.auth.uid).get();
 if(!member.exists||member.data()?.role!=='owner')
  throw new HttpsError('permission-denied','Workspace owner is required');
 return {org,uid:req.auth.uid};
}
const projects=org=>org.collection('managedCloudProjects');
const safeProject=d=>({
 id:d.id,name:d.name,repository:d.repository,branch:d.branch,
 cloudProvider:d.cloudProvider,cloudRegion:d.cloudRegion,serviceName:d.serviceName,
 monthlyBudgetUsd:d.monthlyBudgetUsd,autoDeploy:d.autoDeploy,
 status:d.status,lastRunId:d.lastRunId||null,lastCommit:d.lastCommit||null,
 lastSuccessAt:d.lastSuccessAt?.toDate?.()?.toISOString?.()||null,
 createdAt:d.createdAt?.toDate?.()?.toISOString?.()||null,
 deploymentConfigured:d.deploymentConfigured===true,
 liveDeploymentVerified:d.liveDeploymentVerified===true
});
function newToken(){return randomBytes(32).toString('hex');}
export const cloudRegisterGithubService=onCall({region,enforceAppCheck:true},async req=>{
 const {org,uid}=await owner(req);
 let input;try{input=serviceSchema.parse(req.data?.service)}
 catch(_){throw new HttpsError('invalid-argument','Invalid service configuration, repository or consent');}
 const match=normalizedRepository(input.repository);
 const count=await projects(org).count().get();
 if(count.data().count>=50)throw new HttpsError('resource-exhausted','Workspace project limit reached');
 const id=randomUUID(),token=newToken(),ref=projects(org).doc(id);
 await ref.create({id,...input,repository:match.canonical,
  cloudProvider:input.cloudProvider,status:'awaiting_ci_configuration',
  ingestionTokenHash:hashIngestionToken(token),
  deploymentConfigured:false,liveDeploymentVerified:false,
  createdBy:uid,createdAt:FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp()});
 await org.collection('cloudAutomationAudit').add({action:'github_project.registered',projectId:id,
  actor:uid,at:FieldValue.serverTimestamp(),cloudChangesMade:false});
 return {id,ingestionToken:token,showOnce:true,provider:input.cloudProvider,
  workflowPath:'.github/workflows/tekntandao-multicloud.yml',
  requiredGithubSecrets:['TEKNTANDAO_INGEST_TOKEN'],
  requiredGithubVariables:['TEKNTANDAO_PROJECT_ID','TEKNTANDAO_ORG_ID',
   'TEKNTANDAO_INGEST_URL','TEKNTANDAO_AUTH_URL','CLOUD_PROVIDER'],
  notice:'Store the token as a GitHub Actions secret now. Workspace will not display it again. No cloud resources were deployed.'};
});
export const cloudRotateIngestionToken=onCall({region,enforceAppCheck:true},async req=>{
 const {org,uid}=await owner(req);
 const id=z.string().uuid().parse(req.data?.projectId);
 const ref=projects(org).doc(id),token=newToken();
 if(!(await ref.get()).exists)throw new HttpsError('not-found','Project missing');
 await ref.update({ingestionTokenHash:hashIngestionToken(token),
  updatedBy:uid,updatedAt:FieldValue.serverTimestamp()});
 return {ingestionToken:token,showOnce:true,previousTokenRevoked:true};
});
export const cloudListGithubServices=onCall({region,enforceAppCheck:true},async req=>{
 const {org}=await owner(req);
 const docs=await projects(org).orderBy('createdAt','desc').limit(50).get();
 return {projects:docs.docs.map(d=>safeProject({id:d.id,...d.data()})),
  note:'Deployments are performed by customer-owned GitHub Actions after explicit cloud role configuration.'};
});
export const cloudGetGithubServiceInsights=onCall({region,enforceAppCheck:true},async req=>{
 const {org}=await owner(req);
 const id=z.string().uuid().parse(req.data?.projectId);
 const ref=projects(org).doc(id),doc=await ref.get();
 if(!doc.exists)throw new HttpsError('not-found','Project missing');
 const snap=await ref.collection('runs').orderBy('receivedAt','desc').limit(30).get();
 const runs=snap.docs.map(d=>d.data());
 return {project:safeProject({id,...doc.data()}),runs:runs.map(r=>({
  runId:r.runId,sha:r.sha,status:r.status,branch:r.branch,
  durationSec:r.durationSec??null,serviceUrl:r.serviceUrl??null,
  receivedAt:r.receivedAt?.toDate?.()?.toISOString?.()||null
 })),insights:computeCloudInsights(runs,doc.data().monthlyBudgetUsd),
  telemetrySource:'customer_ci_reported',
  externalCloudMetricsVerified:false};
});
// CI-callback endpoint. Credential is per-project, scoped to one org and project.
// The secret is hashed in Firestore, provided only once and sent by GitHub Actions.
export const managedCloudCiReport=onRequest({
 region,cors:false,timeoutSeconds:30,maxInstances:10
},async(req,res)=>{
 if(req.method!=='POST'){res.status(405).send('Method not allowed');return;}
 if(!req.is('application/json')){res.status(415).send('JSON required');return;}
 const auth=String(req.headers.authorization||'');
 const token=auth.startsWith('Bearer ')?auth.slice(7):'';
 const orgId=String(req.body?.orgId||''),projectId=String(req.body?.projectId||'');
 if(!/^[A-Za-z0-9_-]{10,128}$/.test(orgId)||!z.string().uuid().safeParse(projectId).success){
  res.status(400).send('Invalid request');return;
 }
 const ref=db.doc('organizations/'+orgId+'/managedCloudProjects/'+projectId);
 const doc=await ref.get();
 if(!doc.exists||!verifyIngestionToken(token,doc.data().ingestionTokenHash)){
  res.status(401).send('Unauthorized');return;
 }
 let run;try{run=runSignalSchema.parse(req.body?.run);}
 catch(_){res.status(400).send('Invalid metrics');return;}
 if(run.branch!==doc.data().branch){res.status(403).send('Branch not authorised');return;}
 const runRef=ref.collection('runs').doc(run.runId);
 if(run.status==='success'){
  const bill=(await db.doc('organizations/'+orgId+'/managedCloudBilling/'+projectId).get()).data();
  if(!isCloudServicePaid(bill)){res.status(402).send('Subscription payment required');return;}
 }
 try {
 await db.runTransaction(async tx=>{
  const existing=await tx.get(runRef);
  if(existing.exists){
   if(existing.data().sha!==run.sha||existing.data().status!==run.status)
    throw new Error('Conflicting CI run replay');
   return;
  }
  tx.create(runRef,{...run,receivedAt:FieldValue.serverTimestamp(),
   source:'customer_github_ci',verifiedCloudMetrics:false});
  tx.update(ref,{status:run.status==='success'?'reported_deployed':'ci_'+run.status,
   lastRunId:run.runId,lastCommit:run.sha,updatedAt:FieldValue.serverTimestamp(),
   deploymentConfigured:true,liveDeploymentVerified:false,
   ...(run.status==='success'?{lastSuccessAt:FieldValue.serverTimestamp()}: {})});
 });
 res.status(202).json({accepted:true,providerVerified:false});
 }catch(_){res.status(409).send('Conflicting or invalid run report');}
});

export const managedCloudAuthorizeDeploy=onRequest({
 region,cors:false,timeoutSeconds:20,maxInstances:10
},async(req,res)=>{
 res.set('cache-control','no-store');
 if(req.method!=='POST'){res.status(405).end();return;}
 const token=String(req.headers.authorization||'').replace(/^Bearer /,'');
 const orgId=String(req.body?.orgId||''),projectId=String(req.body?.projectId||'');
 if(!/^[A-Za-z0-9_-]{10,128}$/.test(orgId)||!z.string().uuid().safeParse(projectId).success){
  res.status(400).end();return;
 }
 const ref=db.doc('organizations/'+orgId+'/managedCloudProjects/'+projectId);
 const project=await ref.get();
 if(!project.exists||!verifyIngestionToken(token,project.data().ingestionTokenHash)){
  res.status(401).end();return;
 }
 const bill=(await db.doc('organizations/'+orgId+'/managedCloudBilling/'+projectId).get()).data();
 const decision=decideManagedCloudDeployment({
  project:project.data(),billing:bill,
  branch:req.body?.branch,cloudProvider:req.body?.cloudProvider
 });
 if(!decision.authorized){
  res.status(decision.reason==='subscription_not_paid_or_expired'?402:403)
   .json({authorized:false,reason:decision.reason});return;
 }
 res.status(200).json({...decision,
  notice:'TeknTandao management subscription only; cloud provider consumption is billed separately'});
});
