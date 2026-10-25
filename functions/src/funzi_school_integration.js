import {onCall,HttpsError} from 'firebase-functions/v2/https';
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
