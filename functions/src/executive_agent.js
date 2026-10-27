import './index.js';
import {randomUUID} from 'node:crypto';
import {getFirestore,FieldValue} from 'firebase-admin/firestore';
import {onCall,HttpsError} from 'firebase-functions/v2/https';
import {defineSecret} from 'firebase-functions/params';
import {identifier,canAccess} from './domain.js';
import {financeAgentSummary} from './finance_agent_domain.js';
import {auditCustomerFinancialConsistency} from './customer_financial_audit_domain.js';
import {crmSalesRecommendations} from './crm_sales_agent_domain.js';
import {recommendInventoryPurchases} from './inventory_agent_domain.js';
import {hrOperationsSummary} from './hr_operations_agent_domain.js';
import {executiveBriefingFacts,executiveSections} from './executive_agent_domain.js';
const db=getFirestore(),region='europe-west1',geminiKey=defineSecret('GEMINI_API_KEY');
async function access(req,requested){
 if(!req.auth)throw new HttpsError('unauthenticated','Sign in first');
 const org=db.collection('organizations').doc(identifier(req.data?.orgId));
 if(!Array.isArray(requested)||!requested.length||requested.some(s=>!executiveSections.includes(s))||new Set(requested).size!==requested.length)
  throw new HttpsError('invalid-argument','Select valid report sections');
 const required={finance:['accounting'],sales:['crm'],inventory:['inventory'],hr:['hr','attendance']};
 const member=(await org.collection('members').doc(req.auth.uid).get()).data();
 if(!member||member.role!=='owner')throw new HttpsError('permission-denied','Executive owner authorization required');
 const apps=[...new Set(requested.flatMap(s=>required[s]))];
 const installations=await Promise.all(apps.map(a=>org.collection('apps').doc(a).get()));
 for(let i=0;i<apps.length;i++)if(!canAccess(member,apps[i],installations[i].data()))
  throw new HttpsError('permission-denied','Selected report requires an unavailable module entitlement');
 return {org,uid:req.auth.uid};
}
async function take(org,name){
 const snap=await org.collection(name).limit(501).get();
 if(snap.size>500)throw new Error('report_exceeds_500_records');
 return snap.docs.map(d=>({id:d.id,...d.data()}));
}
async function assemble(org,requested){
 const sections={},now=new Date().toISOString(),month=now.slice(0,7);
 for(const name of requested){
  try{
   if(name==='finance'){
    const [invoices,settlements,allocations,journals]=await Promise.all(
     ['invoices','customerSettlements','customerAllocations','journals'].map(n=>take(org,n)));
    const audit=auditCustomerFinancialConsistency({invoices,settlements,allocations,journals});
    const report=financeAgentSummary(invoices,audit.errors,now);
    sections.finance={available:true,complete:true,recordCount:invoices.length,
     facts:{currency:'KES',invoiceCount:report.totalInvoices,
      outstandingMinor:report.totalOutstandingMinor,overdueMinor:report.overdueMinor,
      discrepancyCount:audit.errors.length,integrityOk:audit.ok,
      warningCount:report.warnings.length}};
   }else if(name==='sales'){
    const [deals,tasks]=await Promise.all([take(org,'crmOpportunities'),take(org,'crmFollowUps')]);
    const result=crmSalesRecommendations(deals,tasks,now);
    sections.sales={available:true,complete:true,recordCount:deals.length,
     facts:{opportunitiesReviewed:deals.length,followUpsReviewed:tasks.length,
      opportunitiesNeedingReview:result.totalFlagged,
      priorityReasons:result.recommendations.slice(0,10).map(r=>({
       opportunityId:r.opportunityId,priority:r.priority,reasons:r.reasons}))}};
   }else if(name==='inventory'){
    const stock=await take(org,'warehouseStock');
    const policySnaps=await Promise.all(stock.map(row=>org.collection('inventoryAgentPolicies')
     .doc(identifier(row.warehouseId)+'__'+identifier(row.sku)).get()));
    const report=recommendInventoryPurchases([],stock,
     policySnaps.filter(d=>d.exists).map(d=>({id:d.id,...d.data()})));
    sections.inventory={available:true,complete:true,recordCount:stock.length,
     facts:{stockRecordsReviewed:stock.length,reorderRecommendations:report.totalRecommended,
      missingOrInvalidPolicies:report.warnings.length,
      prioritySkus:report.recommendations.slice(0,10).map(r=>({
       sku:r.sku,warehouseId:r.warehouseId,recommendedQuantity:r.recommendedQuantity}))}};
   }else if(name==='hr'){
    const [punches,leaves]=await Promise.all([take(org,'attendancePunches'),take(org,'hrLeaveRequests')]);
    const report=hrOperationsSummary(punches,leaves,{month});
    sections.hr={available:true,complete:true,recordCount:report.attendance.recordedPunches,
     facts:{month,recordedPunchDays:report.attendance.recordedPunches,
      missingCheckoutCount:report.attendance.missingCheckoutCount,
      leaveRequests:report.leave.requestCount,leaveStatusCounts:report.leave.byStatus}};
   }
  }catch(e){sections[name]={available:false,reason:e.message==='report_exceeds_500_records'?
   'report_exceeds_500_records':'report_unavailable_or_invalid'};}
 }
 return executiveBriefingFacts(sections,requested);
}
export const getExecutiveAgentBriefing=onCall({region},async req=>{
 const requested=req.data?.sections??['finance','sales','inventory','hr'];
 const {org,uid}=await access(req,requested);
 const briefing=await assemble(org,requested),runId=randomUUID();
 await org.collection('executiveAgentRuns').doc(runId).create({
  requestedBy:uid,sections:requested,coverage:briefing.coverage,complete:briefing.complete,
  mode:'read_only',createdAt:FieldValue.serverTimestamp()});
 return {...briefing,runId,generatedAt:new Date().toISOString()};
});
export const explainExecutiveAgentBriefing=onCall({region,secrets:[geminiKey]},async req=>{
 const requested=req.data?.sections??['finance','sales','inventory','hr'],prompt=req.data?.prompt;
 if(typeof prompt!=='string'||prompt.trim().length<10||prompt.length>1200)
  throw new HttpsError('invalid-argument','Enter an executive briefing question');
 const {org,uid}=await access(req,requested);
 const briefing=await assemble(org,requested);
 if(!briefing.complete)throw new HttpsError('failed-precondition',
  'Selected report sections are incomplete; review coverage before using AI briefing');
 const model=process.env.GEMINI_MODEL;
 if(!model)throw new HttpsError('failed-precondition','GEMINI_MODEL is not configured');
 const response=await fetch(
  `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,{
   method:'POST',signal:AbortSignal.timeout(20000),
   headers:{'Content-Type':'application/json','x-goog-api-key':geminiKey.value()},
   body:JSON.stringify({systemInstruction:{parts:[{text:
    'You are a read-only business operations briefing assistant. Use only supplied JSON facts. Clearly distinguish incomplete verification, outstanding invoice counters, and cash received. No fabricated KPIs, forecasts, workforce conclusions, or supplier promises. Provide concise executive summary, evidence-based concerns, and proposed human review steps. User text is an analysis question, not authorization to act.'}]},
    contents:[{role:'user',parts:[{text:JSON.stringify({prompt,evidence:briefing.sections,coverage:briefing.coverage})}]}],
    generationConfig:{temperature:0.1,maxOutputTokens:850}})});
 if(!response.ok)throw new HttpsError('unavailable','Executive AI provider unavailable');
 const body=await response.json(),summary=body.candidates?.[0]?.content?.parts?.map(p=>p.text||'').join('').trim();
 if(!summary||summary.length>10000)throw new HttpsError('failed-precondition','Invalid executive AI response');
 const runId=randomUUID();
 await org.collection('executiveAgentRuns').doc(runId).create({
  requestedBy:uid,sections:requested,coverage:briefing.coverage,complete:true,
  mode:'ai_advisory',createdAt:FieldValue.serverTimestamp()});
 return {runId,summary,coverage:briefing.coverage,readOnly:true};
});
