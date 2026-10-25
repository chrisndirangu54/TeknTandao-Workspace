import {randomBytes,createHash} from 'node:crypto';
import {onCall,onRequest,HttpsError} from 'firebase-functions/v2/https';
import {initializeApp,getApp} from 'firebase-admin/app';
import {getAuth} from 'firebase-admin/auth';
import {getFirestore,FieldValue} from 'firebase-admin/firestore';
import {identifier,canAccess} from './domain.js';

const db=getFirestore(),stamp=()=>FieldValue.serverTimestamp();
const api=handler=>onCall({region:'europe-west1'},async request=>{
 try{return await handler(request);}
 catch(error){if(error instanceof HttpsError)throw error;
  throw new HttpsError('failed-precondition',error.message||'School integration error');}
});
const types={lessons:'lesson',assignments:'assignment',announcements:'announcement'};
function access(request){
 if(!request.auth?.uid)throw new HttpsError('unauthenticated','Firebase authentication required');
 return {org:db.doc('organizations/'+identifier(request.data?.orgId)),uid:request.auth.uid};
}
export const configureFunziSchoolAccess=api(async request=>{
 const {org,uid}=access(request);
 const [member,installed]=await Promise.all([org.collection('members').doc(uid).get(),
  org.collection('apps').doc('school').get()]);
 if(member.data()?.role!=='owner'||!canAccess(member.data(),'school',installed.data()))
   throw new HttpsError('permission-denied','School owner required');
 const funziUid=identifier(request.data.funziUid);
 if(funziUid===uid)throw new Error('Use a dedicated Funzi service identity');
 const classNames=request.data.classNames;
 if(!Array.isArray(classNames)||!classNames.length||classNames.length>100||
   classNames.some(x=>typeof x!=='string'||!x.trim()||x.length>100))
   throw new Error('Explicit allowed classes required');
 const active=request.data.active;
 if(typeof active!=='boolean')throw new Error('Active flag required');
 await org.collection('integrations').doc('funziSchool').set({
  funziUid,classNames:[...new Set(classNames)],active,
  allowedTypes:['lessons','assignments','announcements'],
  updatedBy:uid,updatedAt:stamp()});
 return {active,funziUid,classNames:[...new Set(classNames)],
  allowedTypes:['lessons','assignments','announcements']};
});

// Student or verified guardian initiates a time-limited link. A matching email
// is never sufficient authentication: both accounts must complete this handshake.
export const createFunziLinkCode=api(async request=>{
 const {org,uid}=access(request);
 const studentId=identifier(request.data.studentId);
 const [student,config,installation]=await Promise.all([
  org.collection('students').doc(studentId).get(),
  org.collection('integrations').doc('funziSchool').get(),
  org.collection('apps').doc('school').get()]);
 if(!student.exists)throw new HttpsError('not-found','Student not found');
 if(student.data().portalUid!==uid && student.data().guardianUid!==uid)
  throw new HttpsError('permission-denied','Verified student or guardian login required');
 if(!config.data()?.active||!installation.data()?.expiresAt?.toMillis||
    installation.data().expiresAt.toMillis()<=Date.now())
  throw new HttpsError('failed-precondition','School integration inactive');
 const code=randomBytes(24).toString('base64url');
 const requestId=randomBytes(16).toString('hex');
 const expiresAt=Date.now()+5*60*1000;
 await org.collection('funziLinkRequests').doc(requestId).create({
  studentId,requesterUid:uid,codeHash:createHash('sha256').update(code).digest('hex'),
  expiresAt,used:false,createdAt:stamp()});
 return {requestId,code,expiresAt};
});

// Redeem only from configured Funzi service identity, carrying an authenticated
// learner ID obtained on Funzi's own backend. Links are single use.
export const redeemFunziLinkCode=api(async request=>{
 const {org,uid}=access(request);
 const requestId=identifier(request.data.requestId);
 const learnerId=identifier(request.data.funziLearnerId);
 const code=request.data.code;
 if(typeof code!=='string'||! /^[A-Za-z0-9_-]{32,64}$/.test(code))
  throw new HttpsError('invalid-argument','Invalid linking code');
 const ref=org.collection('funziLinkRequests').doc(requestId);
 const linked=org.collection('funziStudentLinks').doc(learnerId);
 const integration=org.collection('integrations').doc('funziSchool');
 return db.runTransaction(async tx=>{
  const [pending,config,prior]=await Promise.all([tx.get(ref),tx.get(integration),tx.get(linked)]);
  if(!config.data()?.active||config.data().funziUid!==uid)
   throw new HttpsError('permission-denied','Dedicated Funzi identity required');
  const data=pending.data();
  if(!data||data.used||data.expiresAt<=Date.now()||
     data.codeHash!==createHash('sha256').update(code).digest('hex'))
   throw new HttpsError('permission-denied','Link request invalid or expired');
  if(prior.exists&&prior.data().active&&prior.data().studentId!==data.studentId)
   throw new HttpsError('already-exists','Learner already linked to another student');
  tx.set(linked,{funziLearnerId:learnerId,studentId:data.studentId,
   active:true,linkedAt:stamp(),linkedBy:'verified_handshake',requestId});
  tx.update(ref,{used:true,usedAt:stamp(),linkedLearnerId:learnerId});
  return {linked:true,funziLearnerId:learnerId};
 });
});

// School owner explicitly links one student to one Funzi learner identity.
// Do not provide a roster endpoint or broad class feed.
export const linkFunziStudent=api(async request=>{
 const {org,uid}=access(request);
 const [member,installation,config]=await Promise.all([
  org.collection('members').doc(uid).get(),
  org.collection('apps').doc('school').get(),
  org.collection('integrations').doc('funziSchool').get()]);
 if(member.data()?.role!=='owner'||!canAccess(member.data(),'school',installation.data()))
  throw new HttpsError('permission-denied','School owner required');
 if(!config.data()?.active)throw new Error('Funzi integration must be active');
 const studentId=identifier(request.data.studentId);
 const funziLearnerId=identifier(request.data.funziLearnerId);
 const active=request.data.active;
 if(typeof active!=='boolean')throw new Error('Active flag required');
 const student=await org.collection('students').doc(studentId).get();
 if(!student.exists)throw new Error('Student not found');
 // Administrative confirmation is required; never infer a relationship from a
 // supplied name, class, or email. Enrollment consent must be handled externally.
 if(request.data.linkApproved!==true)throw new Error('Explicit student-link approval required');
 await org.collection('funziStudentLinks').doc(funziLearnerId).set({
  studentId,funziLearnerId,active,approvedBy:uid,updatedAt:stamp()
 });
 return {funziLearnerId,active};
});

// Retrieves only the specific linked learner's class curriculum; no class roster,
// student names, attendance, grades, notes or financial data are transmitted.
export const funziSchoolFeed=api(async request=>{
 const {org,uid}=access(request);
 const funziLearnerId=identifier(request.data.funziLearnerId);
 const [integration,installation,link]=await Promise.all([
  org.collection('integrations').doc('funziSchool').get(),
  org.collection('apps').doc('school').get(),
  org.collection('funziStudentLinks').doc(funziLearnerId).get()]);
 const config=integration.data();
 if(!config?.active||config.funziUid!==uid)
  throw new HttpsError('permission-denied','Funzi service identity not authorized');
 if(!installation.data()?.expiresAt?.toMillis||
    installation.data().expiresAt.toMillis()<=Date.now())
  throw new HttpsError('permission-denied','Active school subscription required');
 if(!link.data()?.active||link.data().funziLearnerId!==funziLearnerId)
  throw new HttpsError('permission-denied','Funzi learner has no active student link');
 const student=await org.collection('students').doc(link.data().studentId).get();
 if(!student.exists)throw new HttpsError('permission-denied','Linked student unavailable');
 const className=student.data().className;
 if(typeof className!=='string'||!config.classNames?.includes(className))
  throw new HttpsError('permission-denied','Linked student class is not permitted');
 const type=request.data.type;
 if(!Object.hasOwn(types,type)||!config.allowedTypes?.includes(type))
  throw new Error('Unsupported Funzi feed type');
 const count=request.data.limit??50;
 if(!Number.isInteger(count)||count<1||count>100)throw new Error('Limit must be 1 to 100');
 const after=request.data.afterId;
 if(after!==undefined)identifier(after);
 const collection=org.collection('modules').doc('school').collection('records');
 let query=collection.where('kind','==',types[type]).where('className','==',className)
  .orderBy('__name__').limit(count+1);
 if(after)query=query.startAfter(collection.doc(after));
 const result=await query.get();
 const page=result.docs.slice(0,count);
 const items=page.map(doc=>{
  const x=doc.data();
  const base={id:doc.id,type,name:x.name,subject:x.subject||null};
  if(type==='assignments')return {...base,dueAt:x.dueAt};
  return base;
 });
 return {schemaVersion:2,orgId:org.id,funziLearnerId,type,
  items,nextCursor:result.size>count?page.at(-1)?.id??null:null,readOnly:true};
});

// Direct cross-project redemption. Funzi Firebase bearer token is verified by
// the official Admin SDK against the separately configured Funzi project.
// A valid code proves control of the school-side authenticated session.
export const redeemFunziLinkFromFunzi=onRequest({region:'europe-west1',cors:true},async (req,res)=>{
 if(req.method!=='POST'){res.status(405).json({error:'Method not allowed'});return;}
 const projectId=process.env.FUNZI_FIREBASE_PROJECT_ID;
 if(!projectId){res.status(503).json({error:'Funzi project not configured'});return;}
 try{
  const bearer=req.headers.authorization;
  if(typeof bearer!=='string'||!bearer.startsWith('Bearer '))
    {res.status(401).json({error:'Funzi login required'});return;}
  let app;
  try{app=getApp('funzi-verifier');}
  catch{app=initializeApp({projectId},'funzi-verifier');}
  const user=await getAuth(app).verifyIdToken(bearer.slice(7),true);
  const orgId=identifier(req.body?.orgId);
  const requestId=identifier(req.body?.requestId);
  const code=req.body?.code;
  if(typeof code!=='string'||! /^[A-Za-z0-9_-]{32,64}$/.test(code))
    {res.status(400).json({error:'Invalid linking code'});return;}
  const org=db.doc('organizations/'+orgId);
  const ref=org.collection('funziLinkRequests').doc(requestId);
  const linked=org.collection('funziStudentLinks').doc(user.uid);
  const integration=org.collection('integrations').doc('funziSchool');
  const result=await db.runTransaction(async tx=>{
   const [pending,config,prior]=await Promise.all([tx.get(ref),tx.get(integration),tx.get(linked)]);
   const data=pending.data();
   if(!config.data()?.active||!data||data.used||data.expiresAt<=Date.now()||
       data.codeHash!==createHash('sha256').update(code).digest('hex'))
     throw new Error('Expired or invalid linking request');
   if(prior.exists&&prior.data().active&&prior.data().studentId!==data.studentId)
     throw new Error('Funzi account already linked to another student');
   tx.set(linked,{funziLearnerId:user.uid,studentId:data.studentId,
    active:true,linkedAt:stamp(),linkedBy:'dual_authenticated_code',requestId});
   tx.update(ref,{used:true,usedAt:stamp(),linkedLearnerId:user.uid});
   return {linked:true,funziLearnerId:user.uid};
  });
  res.status(200).json(result);
 }catch(error){res.status(403).json({error:'Unable to verify or complete link'});}
});
