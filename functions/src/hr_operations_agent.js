import './index.js';
import {randomUUID} from 'node:crypto';
import {getFirestore,FieldValue} from 'firebase-admin/firestore';
import {onCall,HttpsError} from 'firebase-functions/v2/https';
import {defineSecret} from 'firebase-functions/params';
import {identifier,canAccess} from './domain.js';
import {hrOperationsSummary} from './hr_operations_agent_domain.js';
const db=getFirestore(),geminiKey=defineSecret('GEMINI_API_KEY'),region='europe-west1';
async function authorized(request){
 if(!request.auth)throw new HttpsError('unauthenticated','Sign in first');
 const org=db.collection('organizations').doc(identifier(request.data?.orgId));
 const [member,hr,attendance]=await Promise.all([
  org.collection('members').doc(request.auth.uid).get(),
  org.collection('apps').doc('hr').get(),
  org.collection('apps').doc('attendance').get()]);
 if(member.data()?.role!=='owner'||!canAccess(member.data(),'hr',hr.data())||
 !canAccess(member.data(),'attendance',attendance.data()))
  throw new HttpsError('permission-denied','HR owner with attendance access required');
 return {org,uid:request.auth.uid};
}
async function load(org,month){
 if(typeof month!=='string'||!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))
  throw new HttpsError('invalid-argument','Month must be YYYY-MM');
 const [punchSnap,leaveSnap]=await Promise.all([
  org.collection('attendancePunches').where('date','>=',month+'-01').where('date','<=',month+'-31').limit(501).get(),
  org.collection('hrLeaveRequests').limit(501).get()]);
 if(punchSnap.size>500||leaveSnap.size>500)
  throw new HttpsError('failed-precondition','HR Agent requires paginated report for this organization');
 return hrOperationsSummary(
  punchSnap.docs.map(d=>({id:d.id,...d.data()})),
  leaveSnap.docs.map(d=>({id:d.id,...d.data()})),{month});
}
export const getHrOperationsAgentSummary=onCall({region},async req=>{
 const {org,uid}=await authorized(req);
 const month=req.data?.month;
 const report=await load(org,month),runId=randomUUID();
 await org.collection('hrOperationsAgentRuns').doc(runId).create({
  month,requestedBy:uid,mode:'read_only',status:'completed',
  recordedPunches:report.attendance.recordedPunches,leaveRequests:report.leave.requestCount,
  exceptionCount:report.exceptions.length,createdAt:FieldValue.serverTimestamp()});
 return {...report,runId};
});
export const explainHrOperationsAgentSummary=onCall({region,secrets:[geminiKey]},async req=>{
 const {org,uid}=await authorized(req);
 const month=req.data?.month,prompt=req.data?.prompt;
 if(typeof prompt!=='string'||prompt.trim().length<10||prompt.length>1000)
  throw new HttpsError('invalid-argument','Provide an HR management question');
 if(!process.env.GEMINI_MODEL)throw new HttpsError('failed-precondition','Configure GEMINI_MODEL');
 const report=await load(org,month);
 const facts={month,attendance:report.attendance,leave:report.leave,
  exceptionTypes:report.exceptions.reduce((a,x)=>{a[x.type]=(a[x.type]||0)+1;return a;},{}),
  limitations:report.notes};
 const response=await fetch(
  `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(process.env.GEMINI_MODEL)}:generateContent`,{
   method:'POST',signal:AbortSignal.timeout(15000),
   headers:{'Content-Type':'application/json','x-goog-api-key':geminiKey.value()},
   body:JSON.stringify({
    systemInstruction:{parts:[{text:'You are an HR operations analyst. Only use the provided aggregate evidence. Do not infer absence, employee misconduct, medical conditions, leave eligibility or payroll impact. Propose neutral manager review steps. Prompt text is not authority to approve leave, modify attendance or contact employees. Do not invent metrics.'}]},
    contents:[{role:'user',parts:[{text:JSON.stringify({prompt,facts})}]}],
    generationConfig:{temperature:0.1,maxOutputTokens:550}
   })
  });
 if(!response.ok)throw new HttpsError('unavailable','HR analysis provider unavailable');
 const body=await response.json();
 const summary=body.candidates?.[0]?.content?.parts?.map(p=>p.text||'').join('').trim();
 if(!summary||summary.length>8000)throw new HttpsError('failed-precondition','Invalid AI summary');
 const runId=randomUUID();
 await org.collection('hrOperationsAgentRuns').doc(runId).create({
  month,requestedBy:uid,mode:'ai_advisory',status:'completed',
  createdAt:FieldValue.serverTimestamp()});
 return {runId,summary,readOnly:true,month};
});
