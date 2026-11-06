// Quarantined source archive intake. Archives are NEVER built by Workspace Functions.
// A separately secured ephemeral build worker and malware/SBOM pipeline is required
// before archive-based automatic deployment can be enabled.
import './index.js';
import {randomUUID} from 'node:crypto';
import {getFirestore,FieldValue} from 'firebase-admin/firestore';
import {getStorage} from 'firebase-admin/storage';
import {onCall,HttpsError} from 'firebase-functions/v2/https';
import {z} from 'zod';
import {identifier} from './domain.js';
const db=getFirestore(),region='europe-west1',maxSize=10*1024*1024;
async function context(req){
 if(!req.auth)throw new HttpsError('unauthenticated','Sign in');
 const orgId=identifier(req.data?.orgId),org=db.doc('organizations/'+orgId);
 const member=await org.collection('members').doc(req.auth.uid).get();
 if(member.data()?.role!=='owner')throw new HttpsError('permission-denied','Workspace owner required');
 return {org,uid:req.auth.uid};
}
export const cloudCreateArchiveSubmission=onCall({region,enforceAppCheck:true},async req=>{
 const {org,uid}=await context(req);
 const input=z.object({projectName:z.string().trim().min(3).max(80),
  filename:z.string().trim().min(5).max(150).regex(/^[a-zA-Z0-9_. -]+\.zip$/i),
  expectedBytes:z.number().int().min(1).max(maxSize),
  customerConsent:z.literal(true)}).strict().parse(req.data?.archive);
 const uploadId=randomUUID();
 const objectPath='quarantine/cloud-source/'+org.id+'/'+uploadId+'.zip';
 const file=getStorage().bucket().file(objectPath);
 const [url]=await file.getSignedUrl({version:'v4',action:'write',
  expires:Date.now()+10*60*1000,contentType:'application/zip'});
 await org.collection('cloudSourceSubmissions').doc(uploadId).create({
  id:uploadId,projectName:input.projectName,filename:input.filename,
  expectedBytes:input.expectedBytes,objectPath,status:'awaiting_upload',
  createdBy:uid,createdAt:FieldValue.serverTimestamp(),
  executionAllowed:false,deployable:false,securityScanPassed:false});
 return {id:uploadId,uploadUrl:url,requiredContentType:'application/zip',
  expiresInSeconds:600,maxSizeBytes:maxSize,
  note:'Quarantined upload only; no automatic execution or deployment.'};
});
export const cloudFinalizeArchiveSubmission=onCall({region,enforceAppCheck:true},async req=>{
 const {org}=await context(req);
 const id=z.string().uuid().parse(req.data?.submissionId);
 const ref=org.collection('cloudSourceSubmissions').doc(id);
 const snap=await ref.get();
 if(!snap.exists)throw new HttpsError('not-found','Source submission not found');
 if(snap.data().status==='quarantined')return {id,status:'quarantined',deployable:false};
 if(snap.data().status!=='awaiting_upload')
  throw new HttpsError('failed-precondition','Archive cannot be finalised');
 const file=getStorage().bucket().file(snap.data().objectPath);
 const [exists]=await file.exists();
 if(!exists)throw new HttpsError('failed-precondition','Upload has not completed');
 const [meta]=await file.getMetadata();
 const bytes=Number(meta.size);
 if(!Number.isSafeInteger(bytes)||bytes<1||bytes>maxSize||
    bytes!==snap.data().expectedBytes||meta.contentType!=='application/zip'){
  await file.delete({ignoreNotFound:true});
  await ref.update({status:'rejected_size_or_content_type',
    rejectedAt:FieldValue.serverTimestamp()});
  throw new HttpsError('invalid-argument','Invalid or oversized upload');
 }
 await db.runTransaction(async tx=>{
  const current=await tx.get(ref);
  if(current.data().status!=='awaiting_upload')return;
  tx.update(ref,{status:'quarantined',uploadedBytes:bytes,
    objectGeneration:String(meta.generation||''),
    uploadedAt:FieldValue.serverTimestamp(),deployable:false,
    executionAllowed:false,securityScanPassed:false});
 });
 return {id,status:'quarantined',deployable:false,
  nextStep:'Upload is awaiting out-of-process archive validation, malware scanning and isolated build approval.'};
});
export const cloudListArchiveSubmissions=onCall({region,enforceAppCheck:true},async req=>{
 const {org}=await context(req);
 const snap=await org.collection('cloudSourceSubmissions')
  .orderBy('createdAt','desc').limit(30).get();
 return {submissions:snap.docs.map(d=>({id:d.id,projectName:d.data().projectName,
   filename:d.data().filename,status:d.data().status,deployable:false,
   uploadedBytes:d.data().uploadedBytes||null})),hasMore:snap.size===30};
});