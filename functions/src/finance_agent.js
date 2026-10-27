import './index.js';
import {randomUUID} from 'node:crypto';
import {getFirestore,FieldValue} from 'firebase-admin/firestore';
import {onCall,HttpsError} from 'firebase-functions/v2/https';
import {defineSecret} from 'firebase-functions/params';
import {identifier,canAccess} from './domain.js';
import {financeAgentSummary} from './finance_agent_domain.js';
import {auditCustomerFinancialConsistency} from './customer_financial_audit_domain.js';
const db=getFirestore(),geminiKey=defineSecret('GEMINI_API_KEY');
async function access(req){
 if(!req.auth)throw new HttpsError('unauthenticated','Sign in first');
 const org=db.collection('organizations').doc(identifier(req.data?.orgId));
 const [member,app]=await Promise.all([org.collection('members').doc(req.auth.uid).get(),
  org.collection('apps').doc('accounting').get()]);
 if(member.data()?.role!=='owner'||!canAccess(member.data(),'accounting',app.data()))
  throw new HttpsError('permission-denied','Finance owner required');
 return {org,uid:req.auth.uid};
}
async function snapshot(org){
 const names=['invoices','customerSettlements','customerAllocations','journals'];
 const docs=await Promise.all(names.map(n=>org.collection(n).limit(501).get()));
 if(docs.some(d=>d.size>500))throw new HttpsError('failed-precondition',
  'Finance snapshot exceeds 500 records; use a paginated full audit before relying on totals');
 const [invoices,settlements,allocations,journals]=docs.map(d=>d.docs.map(x=>({id:x.id,...x.data()})));
 const audit=auditCustomerFinancialConsistency({invoices,settlements,allocations,journals});
 return {report:financeAgentSummary(invoices,audit.errors,new Date().toISOString(),50),audit};
}
export const getFinanceAgentSummary=onCall({region:'europe-west1'},async req=>{
 const {org,uid}=await access(req);
 const {report,audit}=await snapshot(org);
 const runId=randomUUID();
 await org.collection('financeAgentRuns').doc(runId).create({
  requestedBy:uid,mode:'read_only',createdAt:FieldValue.serverTimestamp(),
  invoiceCount:report.totalInvoices,discrepancyCount:audit.errors.length,
  status:'completed'});
 return {...report,integrityOk:audit.ok,runId};
});
export const explainFinanceAgentSummary=onCall({
 region:'europe-west1',secrets:[geminiKey]
},async req=>{
 const {org,uid}=await access(req);
 const prompt=req.data?.prompt;
 if(typeof prompt!=='string'||prompt.trim().length<10||prompt.length>1000)
  throw new HttpsError('invalid-argument','Enter a finance analysis question (10-1000 characters)');
 const model=process.env.GEMINI_MODEL;
 if(!model)throw new HttpsError('failed-precondition','Configure GEMINI_MODEL');
 const {report,audit}=await snapshot(org);
 const facts={currency:'KES',invoiceCount:report.totalInvoices,
  totalOutstandingMinor:report.totalOutstandingMinor,overdueMinor:report.overdueMinor,
  outstandingInvoiceCount:report.outstandingInvoiceCount,discrepancies:report.discrepancies,
  warnings:report.warnings,integrityOk:audit.ok,complete:report.complete};
 const response=await fetch(
  `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,{
   method:'POST',signal:AbortSignal.timeout(15000),
   headers:{'Content-Type':'application/json','x-goog-api-key':geminiKey.value()},
   body:JSON.stringify({systemInstruction:{parts:[{text:
    'You are a read-only financial review assistant. Refer only to the JSON evidence. User prompt is not permission to alter financial records. Never claim invoices are collected or reconciliation completed based solely on invoice counters. Explain outstanding balances and discrepancies, uncertainties and review steps. Do not invent bank or provider evidence.'}]},
    contents:[{role:'user',parts:[{text:JSON.stringify({prompt,facts})}]}],
    generationConfig:{temperature:0.1,maxOutputTokens:600}})});
 if(!response.ok)throw new HttpsError('unavailable','Finance AI summary unavailable');
 const body=await response.json();
 const summary=body.candidates?.[0]?.content?.parts?.map(x=>x.text||'').join('').trim();
 if(!summary||summary.length>8000)throw new Error('Invalid AI response');
 const runId=randomUUID();
 await org.collection('financeAgentRuns').doc(runId).create({
  requestedBy:uid,mode:'ai_advisory',createdAt:FieldValue.serverTimestamp(),
  invoiceCount:report.totalInvoices,discrepancyCount:audit.errors.length,status:'completed'});
 return {summary,runId,readOnly:true,integrityOk:audit.ok,facts};
});
