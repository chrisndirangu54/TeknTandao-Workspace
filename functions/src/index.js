import {initializeApp} from 'firebase-admin/app';
import {getFirestore, Timestamp, FieldValue, FieldPath} from 'firebase-admin/firestore';
import {getAuth} from 'firebase-admin/auth';
import {onCall, onRequest, HttpsError} from 'firebase-functions/v2/https';
import {onDocumentCreated} from 'firebase-functions/v2/firestore';
import {defineSecret} from 'firebase-functions/params';
import {randomUUID} from 'node:crypto';
import {prepareModuleRecord} from './module_records.js';
import {transitionEncounter,transitionAssessment,assessmentScore} from './vertical_workflows_domain.js';
import {requireVerticalPermission,requireRecordScope} from './vertical_permissions_domain.js';
import {validateAppointment,validateAttendance} from './vertical_operations_domain.js';
import {catalog, identifier, textValue, money, quote, canAccess, saleTotal, expandRequiredApps, sanitizeRecord} from './domain.js';
import {initializePaystack, verifyPaystack, verifyTransaction, initiateMpesa, queryMpesa} from './providers.js';
import {invoiceJournal} from './ledger_domain.js';
import {accountingPeriod, assertOpenPeriod} from './accounting_period_domain.js';
import {preparePosting} from './posting_policy_domain.js';
import {buildPosSaleSnapshot,posReceipt} from './pos_receipts_domain.js';
import {validatePosCart,pricePosCart} from './pos_cart_domain.js';
import {tillReconciliation} from './pos_till_domain.js';
import {maintenanceTicket,transitionMaintenance} from './property_maintenance_domain.js';
import {leaveRequest,overlappingLeave,leaveDecision} from './hr_leave_domain.js';
import {validateLeavePolicy,chargeableLeaveDays,availableAnnualLeave} from './hr_leave_policy_domain.js';
import {leaveYear,consumeLeave,validateLeaveLedger} from './hr_leave_ledger_domain.js';
import {validateAccrualPolicy,accrueAnnualLeave,carryForwardLeave} from './hr_accrual_domain.js';
import {authorizeLeaveApprover,validateLeaveManagerAssignment} from './hr_approvals_domain.js';
import {leaveApprovalTransition} from './hr_multilevel_approval_domain.js';
import {createReview,reviewAssessment} from './hr_performance_domain.js';
import {candidateApplication,advanceCandidate,onboardingTask} from './hr_recruitment_domain.js';
import {validateShift,shiftConflicts,changeShiftStatus} from './hr_shifts_domain.js';
import {reconcileShiftPunches} from './hr_shift_reconciliation_domain.js';
import {draftTimesheet,decideTimesheet} from './hr_timesheets_domain.js';
import {proposeOvertime,decideOvertime} from './hr_overtime_domain.js';
import {payrollTimeRegister} from './hr_payroll_time_domain.js';
import {payrollTimeSnapshot} from './hr_time_lock_domain.js';
import {proposeHrTimeCorrection,decideHrTimeCorrection} from './hr_time_corrections_domain.js';
import {adjustedTimeRegister} from './hr_adjusted_time_domain.js';
import {payrollAuthorizationDraft,authorizePayrollProposal} from './hr_payroll_authorization_domain.js';
import {performanceFeedback,developmentPlan,advanceDevelopmentPlan} from './hr_growth_domain.js';
import {crmOpportunity,crmAdvanceOpportunity,crmFollowUp,crmPipelineSummary} from './crm_pipeline_domain.js';
import {rankCrmLeads} from './crm_lead_scoring_domain.js';
import {crmBoardMetrics} from './crm_board_domain.js';
import {crmAgingReport} from './crm_aging_domain.js';
import {crmConversionReport} from './crm_conversion_domain.js';
import {crmSalesCycleReport} from './crm_cycle_domain.js';
import {crmCampaign,crmAttribution} from './crm_campaign_domain.js';
import {crmCommerceSummary} from './crm_commerce_domain.js';
import {crmInvoiceReconciliation} from './crm_invoice_reconciliation_domain.js';
import {customerSettlementAllocation} from './customer_settlement_transaction_domain.js';
import {settlementDisputeDecision} from './customer_settlement_disputes_domain.js';
import {verifiedCustomerPaystackSettlement} from './customer_paystack_settlement_domain.js';
import {saleInvoicePostingDecision} from './sale_invoice_posting_decision.js';
import {crmPageResult,validateCrmPageSize} from './crm_pagination_domain.js';
import {campaignSpend,campaignEfficiency} from './crm_campaign_spend_domain.js';
import {assignDealOwner,crmTeamPerformance} from './crm_team_domain.js';
import {salesQuota,salesTerritory,quotaAttainment} from './crm_quota_domain.js';
import {crmActivity,crmActivityTimeline} from './crm_activity_domain.js';
import {sequencePlan,sequenceEnrollment,stopSequence} from './crm_sequences_domain.js';
import {crmSuppression,allowedCrmContact,appendCrmSequenceStep} from './crm_suppression_domain.js';
import {suppressActiveEnrollments,suppressionState} from './crm_sequence_suppression_domain.js';
import {validateLease,leaseOverlaps,rentCharge,renewLease,terminateLease} from './property_leases_domain.js';
import {propertyTenantStatement} from './property_statements_domain.js';
import {availableRentAllocation} from './property_payments_domain.js';

initializeApp();
const db = getFirestore();
const paystackSecret = defineSecret('PAYSTACK_SECRET_KEY');
const mpesaConfig = defineSecret('MPESA_CONFIG');
const geminiKey = defineSecret('GEMINI_API_KEY');
const region = 'europe-west1';
const stamp = () => FieldValue.serverTimestamp();
const root = org => db.doc(`organizations/${identifier(org)}`);

function uid(request) {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in first');
  return request.auth.uid;
}
async function authorize(request, app, ownerOnly = false) {
  const user = uid(request);
  const org = root(request.data.orgId);
  const member = (await org.collection('members').doc(user).get()).data();
  if (!member || (ownerOnly && member.role !== 'owner')) throw new HttpsError('permission-denied', 'Organization access denied');
  if (app && !canAccess(member, app, (await org.collection('apps').doc(app).get()).data())) throw new HttpsError('permission-denied', 'App subscription or permission required');
  return {org, user, member};
}
function callable(handler, secrets = []) {
  return onCall({region, secrets}, async request => {
    try { return await handler(request); }
    catch (e) {
      if (e instanceof HttpsError) throw e;
      throw new HttpsError('failed-precondition', e.message?.startsWith('Provider') ? 'Provider unavailable; retry later' : e.message);
    }
  });
}

export const suppressCrmContactChannel = callable(async request=>{
 const {org,user}=await authorize(request,'crm');
 const contactId=identifier(request.data.contactId);
 const suppression=crmSuppression(request.data);
 const ref=org.collection('contacts').doc(contactId);
 const statusRef=org.collection('crmSuppression').doc(contactId+'_'+suppression.channel);
 return db.runTransaction(async tx=>{
  const [contact,existing,active]=await Promise.all([
   tx.get(ref),tx.get(statusRef),
   tx.get(org.collection('crmSequenceEnrollments').where('contactId','==',contactId).limit(401))
  ]);
  if(!contact.exists)throw new Error('Contact not found');
  if(active.size>400)throw new Error('Too many enrollments to suppress safely');
  const ids=suppressActiveEnrollments(active.docs.map(d=>({id:d.id,...d.data()})),suppression.channel);
  tx.set(statusRef,{...suppression,contactId,updatedBy:user,updatedAt:stamp()});
  if(suppression.channel==='all')tx.update(ref,{doNotContact:true,updatedBy:user,updatedAt:stamp()});
  for(const id of ids){
   tx.update(org.collection('crmSequenceEnrollments').doc(id),{
    status:'stopped',stopReason:'Contact channel opt-out: '+suppression.reason,
    stoppedBy:user,stoppedAt:stamp()
   });
  }
  return {contactId,channel:suppression.channel,status:'suppressed',stoppedEnrollments:ids.length};
 });
});
export const addCrmSequenceStep = callable(async request=>{
 const {org}=await authorize(request,'crm');
 const sequenceId=identifier(request.data.sequenceId),ref=org.collection('crmSequences').doc(sequenceId);
 return db.runTransaction(async tx=>{
  const template=await tx.get(ref);
  if(!template.exists)throw new Error('Sequence not found');
  const update=appendCrmSequenceStep(template.data(),request.data.step);
  tx.update(ref,update);
  return {sequenceId,steps:update.steps.length,status:'draft'};
 });
});
export const getCrmContactSuppression = callable(async request=>{
 const {org}=await authorize(request,'crm');
 const contactId=identifier(request.data.contactId);
 const records=await Promise.all(['all','email','whatsapp','call'].map(c=>org.collection('crmSuppression').doc(contactId+'_'+c).get()));
 const contact=await org.collection('contacts').doc(contactId).get();
 if(!contact.exists)throw new Error('Contact not found');
 const suppressions=records.filter(r=>r.exists).map(r=>r.data());
 return {contactId,suppressions,...suppressionState(contact.data(),suppressions)};
});

export const createCrmSequence = callable(async request=>{
 const {org,user}=await authorize(request,'crm');
 const plan=sequencePlan(request.data),id=identifier(request.data.sequenceId||randomUUID());
 await org.collection('crmSequences').doc(id).create({...plan,createdBy:user,createdAt:stamp()});
 return {sequenceId:id,status:'draft'};
});
export const activateCrmSequence = callable(async request=>{
 const {org,user}=await authorize(request,'crm');
 const id=identifier(request.data.sequenceId),ref=org.collection('crmSequences').doc(id);
 return db.runTransaction(async tx=>{
  const snap=await tx.get(ref);
  if(!snap.exists||snap.data().status!=='draft')throw new Error('Draft sequence required');
  tx.update(ref,{status:'active',activatedBy:user,activatedAt:stamp()});
  return {sequenceId:id,status:'active',automaticSending:false};
 });
});
export const enrollCrmSequence = callable(async request=>{
 const {org,user}=await authorize(request,'crm');
 const contactId=identifier(request.data.contactId),sequenceId=identifier(request.data.sequenceId);
 const id=identifier(request.data.enrollmentId||randomUUID()),ref=org.collection('crmSequenceEnrollments').doc(id);
 return db.runTransaction(async tx=>{
  const [template,contact,globalOptOut,channelOptOut,prior]=await Promise.all([
   tx.get(org.collection('crmSequences').doc(sequenceId)),
   tx.get(org.collection('contacts').doc(contactId)),
   tx.get(org.collection('crmSuppression').doc(contactId+'_all')),
   tx.get(org.collection('crmSuppression').doc(contactId+'_'+request.data.channel)),
   tx.get(ref)
  ]);
  if(!template.exists||!contact.exists)throw new Error('Sequence or contact unavailable');
  if(prior.exists)throw new Error('Enrollment ID already exists');
  const suppressionRecords=[globalOptOut,channelOptOut].filter(x=>x.exists).map(x=>x.data());
  if(!allowedCrmContact(contact.data(),suppressionRecords,request.data.channel))
   throw new Error('Contact suppressed for this channel');
  const enrollment=sequenceEnrollment(template.data(),contact.data(),
   request.data.channel,request.data.consent,new Date().toISOString());
  tx.create(ref,{...enrollment,contactId,sequenceId,createdBy:user,createdAt:stamp()});
  return {enrollmentId:id,status:'active',automaticSending:false};
 });
});
export const stopCrmSequenceEnrollment = callable(async request=>{
 const {org,user}=await authorize(request,'crm');
 const id=identifier(request.data.enrollmentId),ref=org.collection('crmSequenceEnrollments').doc(id);
 return db.runTransaction(async tx=>{
  const current=await tx.get(ref);
  if(!current.exists)throw new Error('Enrollment not found');
  const result=stopSequence(current.data(),request.data.reason);
  tx.update(ref,{...result,stoppedBy:user,stoppedAt:stamp()});
  return {enrollmentId:id,status:'stopped'};
 });
});
export const listCrmSequences = callable(async request=>{
 const {org}=await authorize(request,'crm');
 const [templates,enrollments]=await Promise.all([
  org.collection('crmSequences').limit(100).get(),
  org.collection('crmSequenceEnrollments').limit(100).get()]);
 return {templates:templates.docs.map(d=>({id:d.id,...d.data()})),
  enrollments:enrollments.docs.map(d=>({id:d.id,...d.data()})),
  automaticSending:false};
});

export const startCustomerInvoicePaystackPayment = callable(async request=>{
 const {org,member}=await authorize(request,'accounting');
 if(member.role!=='owner')throw new HttpsError('permission-denied','Workspace finance owner required');
 const invoiceId=identifier(request.data.invoiceId);
 const email=textValue(request.data.customerEmail,254);
 const invoiceSnap=await org.collection('invoices').doc(invoiceId).get();
 if(!invoiceSnap.exists)throw new HttpsError('not-found','Invoice missing');
 const invoice=invoiceSnap.data();
 const amountMinor=request.data.amountMinor;
 const outstanding=invoice.total-(invoice.allocatedMinor??0);
 if(invoice.currency!=='KES'||!Number.isSafeInteger(outstanding)||outstanding<=0||
 !Number.isSafeInteger(amountMinor)||amountMinor<=0||amountMinor>outstanding)
 throw new Error('Invalid invoice amount');
 const reference=randomUUID();
 const paymentRef=org.collection('customerPaymentIntents').doc(reference);
 await paymentRef.create({invoiceId,contactId:invoice.contactId,provider:'paystack',
  currency:'KES',amountMinor,state:'initializing',createdAt:stamp()});
 await db.doc(`customerInvoicePaymentReferences/${reference}`).create({orgId:org.id});
 try{
  const initialized=await initializePaystack({secret:paystackSecret.value(),email,amount:amountMinor,reference});
  await paymentRef.update({state:'pending',authorizationUrl:initialized.authorization_url});
  return {reference,url:initialized.authorization_url};
 }catch(error){
  await paymentRef.update({state:'initialization_failed'});
  throw error;
 }
},[paystackSecret]);

export const freezeDisputedCustomerSettlement = callable(async request=>{
 const {org,user,member}=await authorize(request,'accounting');
 if(member.role!=='owner')throw new HttpsError('permission-denied','Workspace finance owner required');
 const settlementId=identifier(request.data.settlementId);
 const reason=request.data.reason;
 const ref=org.collection('customerSettlements').doc(settlementId);
 return db.runTransaction(async tx=>{
  const snap=await tx.get(ref);
  if(!snap.exists)throw new HttpsError('not-found','Customer settlement missing');
  const decision=settlementDisputeDecision(snap.data(),reason);
  if(decision.status==='already_frozen')return {status:'already_frozen'};
  tx.update(ref,{disputeState:'frozen',disputeReason:decision.disputeReason,
   disputedBy:user,disputedAt:stamp()});
  tx.create(org.collection('customerSettlementDisputes').doc(randomUUID()),{
   settlementId,reason:decision.disputeReason,createdBy:user,createdAt:stamp(),
   status:'awaiting_provider_reconciliation'});
  return {status:'frozen'};
 });
});

export const allocateVerifiedCustomerSettlement = callable(async request=>{
 const {org,user,member}=await authorize(request,'accounting');
 if(member.role!=='owner')throw new HttpsError('permission-denied','Workspace finance owner required');
 const invoiceId=identifier(request.data.invoiceId),
  settlementId=identifier(request.data.settlementId),
  allocationId=identifier(request.data.allocationId);
 const amountMinor=request.data.amountMinor;
 const invoiceRef=org.collection('invoices').doc(invoiceId);
 const settlementRef=org.collection('customerSettlements').doc(settlementId);
 const allocationRef=org.collection('customerAllocations').doc(allocationId);
 return db.runTransaction(async tx=>{
  const [invoice,settlement,allocation]=await Promise.all([
   tx.get(invoiceRef),tx.get(settlementRef),tx.get(allocationRef)]);
  if(allocation.exists){
   const recorded=allocation.data();
   if(recorded.invoiceId!==invoiceId||recorded.settlementId!==settlementId||
    recorded.amountMinor!==amountMinor)throw new Error('Allocation ID conflict');
   return {allocationId,status:'already_applied'};
  }
  if(!invoice.exists||!settlement.exists)throw new Error('Invoice or verified settlement not found');
  const result=customerSettlementAllocation(invoice.data(),settlement.data(),amountMinor);
  tx.create(allocationRef,{invoiceId,settlementId,amountMinor,
   verificationSource:settlement.data().verificationSource,createdBy:user,createdAt:stamp()});
  tx.update(invoiceRef,{allocatedMinor:result.invoiceAllocatedMinor,
   outstandingMinor:result.invoiceOutstandingMinor,
   paymentState:result.invoiceOutstandingMinor===0?'paid':'partial',
   updatedAt:stamp()});
  tx.update(settlementRef,{allocatedMinor:result.settlementAllocatedMinor,
   availableMinor:result.settlementAvailableMinor,updatedAt:stamp()});
  return {allocationId,status:'applied',invoiceOutstandingMinor:result.invoiceOutstandingMinor,
   settlementAvailableMinor:result.settlementAvailableMinor};
 });
});

export const getCrmInvoiceReconciliation = callable(async request=>{
 const {org,member}=await authorize(request,'crm');
 const [posApp,accountingApp]=await Promise.all([
  org.collection('apps').doc('pos').get(),org.collection('apps').doc('accounting').get()]);
 if(!canAccess(member,'pos',posApp.data())||!canAccess(member,'accounting',accountingApp.data()))
  throw new HttpsError('permission-denied','CRM, POS and Accounting permissions required');
 const [invoices,sales,contacts]=await Promise.all([
  org.collection('invoices').limit(501).get(),
  org.collection('sales').limit(501).get(),
  org.collection('contacts').limit(501).get()]);
 if([invoices,sales,contacts].some(x=>x.size>500))
  throw new Error('Invoice reconciliation requires pagination');
 return crmInvoiceReconciliation(
  invoices.docs.map(d=>({id:d.id,...d.data()})),
  sales.docs.map(d=>({id:d.id,...d.data()})),
  contacts.docs.map(d=>({id:d.id,...d.data()})));
});

export const getCrmCommerceSummary = callable(async request=>{
 const {org,member}=await authorize(request,'crm');
 const [posApp,accountingApp]=await Promise.all([
  org.collection('apps').doc('pos').get(),org.collection('apps').doc('accounting').get()]);
 if(!canAccess(member,'pos',posApp.data())||!canAccess(member,'accounting',accountingApp.data()))
  throw new HttpsError('permission-denied','CRM, POS and Accounting permissions required');
 const [contacts,deals,sales,invoices]=await Promise.all([
  org.collection('contacts').limit(501).get(),
  org.collection('crmOpportunities').limit(501).get(),
  org.collection('sales').limit(501).get(),
  org.collection('invoices').limit(501).get()]);
 if([contacts,deals,sales,invoices].some(x=>x.size>500))
  throw new Error('Commerce summary requires pagination for large workspaces');
 return {customers:crmCommerceSummary(
  contacts.docs.map(d=>({id:d.id,...d.data()})),
  deals.docs.map(d=>d.data()),sales.docs.map(d=>d.data()),invoices.docs.map(d=>d.data())),
  note:'Snapshot only: sale and invoice records can refer to one transaction. Amounts are not additive. Paid status is not independently verified cash received.'};
});

export const createCrmCampaign = callable(async request=>{
 const {org,user}=await authorize(request,'crm');
 const campaign=crmCampaign(request.data),id=identifier(request.data.campaignId||randomUUID());
 await org.collection('crmCampaigns').doc(id).create({...campaign,createdBy:user,createdAt:stamp()});
 return {campaignId:id};
});
export const getCrmCampaignAttribution = callable(async request=>{
 const {org}=await authorize(request,'crm');
 const [campaigns,deals]=await Promise.all([
  org.collection('crmCampaigns').limit(201).get(),org.collection('crmOpportunities').limit(501).get()]);
 if(campaigns.size>200||deals.size>500)throw new Error('Attribution requires pagination');
 return {campaigns:crmAttribution(deals.docs.map(d=>d.data()),
   campaigns.docs.map(d=>({id:d.id,...d.data()}))),
  method:'Single source selected on opportunity creation; won deal value is not recognized revenue.'};
});

export const recordCrmCampaignSpend = callable(async request=>{
 const {org,user,member}=await authorize(request,'crm');
 if(member.role!=='owner')throw new HttpsError('permission-denied','Workspace owner required');
 const campaignId=identifier(request.data.campaignId);
 const item=campaignSpend(request.data);
 const campaign=await org.collection('crmCampaigns').doc(campaignId).get();
 if(!campaign.exists)throw new Error('Campaign not found');
 const id=identifier(request.data.spendId||randomUUID());
 await org.collection('crmCampaignSpend').doc(id).create({...item,campaignId,createdBy:user,createdAt:stamp()});
 return {spendId:id,campaignId};
});
export const getCrmCampaignEfficiency = callable(async request=>{
 const {org,member}=await authorize(request,'crm');
 if(member.role!=='owner')throw new HttpsError('permission-denied','Workspace owner required');
 const [campaigns,deals,spend]=await Promise.all([
  org.collection('crmCampaigns').limit(201).get(),org.collection('crmOpportunities').limit(501).get(),
  org.collection('crmCampaignSpend').limit(501).get()]);
 if(campaigns.size>200||deals.size>500||spend.size>500)throw new Error('Campaign reporting requires pagination');
 return {results:campaignEfficiency(campaigns.docs.map(d=>({id:d.id,...d.data()})),
  deals.docs.map(d=>d.data()),spend.docs.map(d=>d.data())),
  note:'Manual KES spend and attributed deals; not audited accounting expenditure or actual ROI.'};
});

export const createCrmOpportunity = callable(async request=>{
 const {org,user}=await authorize(request,'crm');
 const proposed=crmOpportunity(request.data);
 const id=identifier(request.data.opportunityId||randomUUID()),ref=org.collection('crmOpportunities').doc(id);
 const campaignId=request.data.campaignId?identifier(request.data.campaignId):null;
 const [contact,campaign]=await Promise.all([
  org.collection('contacts').doc(identifier(proposed.contactId)).get(),
  campaignId?org.collection('crmCampaigns').doc(campaignId).get():Promise.resolve(null)]);
 if(campaignId&&(!campaign.exists||campaign.data().status!=='active'))throw new Error('Active campaign required');
 if(!contact.exists)throw new Error('CRM contact not found');
 await ref.create({...proposed,campaignId,ownerUid:user,createdBy:user,createdAt:stamp(),stageEnteredAt:new Date().toISOString(),updatedAt:stamp()});
 return {id,stage:proposed.stage};
});
export const advanceCrmOpportunity = callable(async request=>{
 const {org,user,member}=await authorize(request,'crm');
 const id=identifier(request.data.opportunityId),ref=org.collection('crmOpportunities').doc(id);
 return db.runTransaction(async tx=>{
  const current=await tx.get(ref);
  if(!current.exists)throw new Error('Opportunity not found');
  if(member.role!=='owner'&&(current.data().ownerUid||current.data().createdBy)!==user)
   throw new HttpsError('permission-denied','Deal owner or sales administrator required');
  const next=crmAdvanceOpportunity(current.data(),request.data.stage,request.data.reason);
  tx.update(ref,{...next,stageEnteredAt:new Date().toISOString(),...(next.stage==='won'||next.stage==='lost'?{closedAt:new Date().toISOString()}:{}),updatedBy:user,updatedAt:stamp()});
  tx.create(ref.collection('history').doc(randomUUID()),{
   from:current.data().stage,to:next.stage,actor:user,
   reason:next.closedReason,at:stamp()});
  return {id,stage:next.stage};
 });
});
export const assignCrmDealOwner = callable(async request=>{
 const {org,user,member}=await authorize(request,'crm');
 if(member.role!=='owner')throw new HttpsError('permission-denied','Sales administrator required');
 const id=identifier(request.data.opportunityId),newOwner=identifier(request.data.ownerUid);
 const ref=org.collection('crmOpportunities').doc(id);
 return db.runTransaction(async tx=>{
  const [deal,assignee]=await Promise.all([tx.get(ref),tx.get(org.collection('members').doc(newOwner))]);
  if(!deal.exists||!assignee.exists)throw new Error('Deal or workspace member missing');
  const change=assignDealOwner(deal.data(),newOwner,request.data.reason);
  tx.update(ref,{...change,updatedBy:user,updatedAt:stamp()});
  tx.create(ref.collection('history').doc(randomUUID()),{
   action:'owner_assigned',from:deal.data().ownerUid||deal.data().createdBy||null,
   to:newOwner,reason:change.assignmentReason,actor:user,at:stamp()});
  return {opportunityId:id,ownerUid:newOwner};
 });
});
export const getCrmTeamPerformance = callable(async request=>{
 const {org,member}=await authorize(request,'crm');
 if(member.role!=='owner')throw new HttpsError('permission-denied','Sales administrator required');
 const deals=await org.collection('crmOpportunities').limit(501).get();
 if(deals.size>500)throw new Error('Sales reporting requires pagination');
 return {team:crmTeamPerformance(deals.docs.map(d=>d.data())),
  scope:'Current stored opportunity snapshot, not realized revenue.'};
});

export const setCrmSalesQuota = callable(async request=>{
 const {org,user,member}=await authorize(request,'crm');
 if(member.role!=='owner')throw new HttpsError('permission-denied','Sales administrator required');
 const quota=salesQuota(request.data);
 const assignee=await org.collection('members').doc(quota.ownerUid).get();
 if(!assignee.exists)throw new Error('Sales member not found');
 await org.collection('crmSalesQuotas').doc(quota.ownerUid+'_'+quota.period).set({...quota,updatedBy:user,updatedAt:stamp()});
 return {ownerUid:quota.ownerUid,period:quota.period};
});
export const setCrmSalesTerritory = callable(async request=>{
 const {org,user,member}=await authorize(request,'crm');
 if(member.role!=='owner')throw new HttpsError('permission-denied','Sales administrator required');
 const territory=salesTerritory(request.data),id=identifier(request.data.territoryId||randomUUID());
 const assignee=await org.collection('members').doc(territory.ownerUid).get();
 if(!assignee.exists)throw new Error('Sales member not found');
 await org.collection('crmSalesTerritories').doc(id).set({...territory,updatedBy:user,updatedAt:stamp()});
 return {territoryId:id};
});
export const getCrmQuotaDashboard = callable(async request=>{
 const {org,member}=await authorize(request,'crm');
 if(member.role!=='owner')throw new HttpsError('permission-denied','Sales administrator required');
 const period=request.data.period;
 if(typeof period!=='string'||!/^\d{4}-(0[1-9]|1[0-2])$/.test(period))throw new Error('Invalid period');
 const [quotas,deals,territories]=await Promise.all([
  org.collection('crmSalesQuotas').limit(301).get(),
  org.collection('crmOpportunities').limit(501).get(),
  org.collection('crmSalesTerritories').limit(301).get()]);
 if(quotas.size>300||deals.size>500||territories.size>300)throw new Error('Report requires pagination');
 return {period,attainment:quotaAttainment(quotas.docs.map(d=>d.data()),deals.docs.map(d=>d.data()),period),
  territories:territories.docs.map(d=>({id:d.id,...d.data()})),
  note:'Won-opportunity value with recorded close date; not recognized accounting revenue.'};
});

export const createCrmFollowUp = callable(async request=>{
 const {org,user}=await authorize(request,'crm');
 const opportunityId=identifier(request.data.opportunityId);
 const proposed=crmFollowUp(request.data);
 const id=identifier(request.data.followUpId||randomUUID()),ref=org.collection('crmFollowUps').doc(id);
 const [opportunity,member]=await Promise.all([
  org.collection('crmOpportunities').doc(opportunityId).get(),
  org.collection('members').doc(proposed.ownerUid).get()]);
 if(!opportunity.exists||!member.exists)throw new Error('Opportunity or assigned workspace member not found');
 await ref.create({...proposed,opportunityId,createdBy:user,createdAt:stamp()});
 return {id,status:'open'};
});
export const completeCrmFollowUp = callable(async request=>{
 const {org,user,member}=await authorize(request,'crm');
 const id=identifier(request.data.followUpId),ref=org.collection('crmFollowUps').doc(id);
 return db.runTransaction(async tx=>{
  const item=await tx.get(ref);
  if(!item.exists||item.data().status!=='open')throw new Error('Open follow-up required');
  if(member.role!=='owner'&&item.data().ownerUid!==user)
   throw new HttpsError('permission-denied','Assigned owner required');
  tx.update(ref,{status:'completed',completedBy:user,completedAt:stamp()});
  return {id,status:'completed'};
 });
});
export const logCrmActivity = callable(async request=>{
 const {org,user}=await authorize(request,'crm');
 const contactId=identifier(request.data.contactId);
 const opportunityId=request.data.opportunityId?identifier(request.data.opportunityId):null;
 const id=identifier(request.data.activityId||randomUUID());
 const [contact,deal]=await Promise.all([
  org.collection('contacts').doc(contactId).get(),
  opportunityId?org.collection('crmOpportunities').doc(opportunityId).get():Promise.resolve(null)]);
 if(!contact.exists)throw new Error('Contact not found');
 if(opportunityId&&(!deal.exists||deal.data().contactId!==contactId))
  throw new Error('Opportunity must belong to contact');
 const activity=crmActivity(request.data);
 await org.collection('crmActivities').doc(id).create({
  ...activity,contactId,opportunityId,createdBy:user,createdAt:stamp()});
 return {activityId:id,status:'logged'};
});
export const listCrmActivityTimeline = callable(async request=>{
 const {org}=await authorize(request,'crm');
 const contactId=identifier(request.data.contactId);
 const contact=await org.collection('contacts').doc(contactId).get();
 if(!contact.exists)throw new Error('Contact not found');
 const history=await org.collection('crmActivities').where('contactId','==',contactId).limit(201).get();
 if(history.size>200)throw new Error('Timeline exceeds supported page; pagination required');
 return {contactId,activities:crmActivityTimeline(history.docs.map(d=>({
  id:d.id,type:d.data().type,summary:d.data().summary,
  occurredAt:d.data().occurredAt,opportunityId:d.data().opportunityId,
  createdBy:d.data().createdBy,source:d.data().source
 }))),source:'manual',automaticallySynced:false};
});

export const getCrmLeadScores = callable(async request=>{
 const {org}=await authorize(request,'crm');
 const [contacts,deals,tasks]=await Promise.all([
  org.collection('contacts').limit(201).get(),
  org.collection('crmOpportunities').limit(501).get(),
  org.collection('crmFollowUps').limit(501).get()]);
 if(contacts.size>200||deals.size>500||tasks.size>500)
  throw new Error('Lead scoring requires pagination for larger workspaces');
 const scores=rankCrmLeads(contacts.docs.map(d=>({id:d.id,...d.data()})),
  deals.docs.map(d=>({id:d.id,...d.data()})),tasks.docs.map(d=>({id:d.id,...d.data()})),new Date().toISOString());
 return {scores,model:'Rules-based signals from CRM data; not a prediction of purchase intent.'};
});

export const getCrmSalesCycleReport = callable(async request=>{
 const {org}=await authorize(request,'crm');
 const period=request.data.period;
 if(typeof period!=='string'||!/^\d{4}-(0[1-9]|1[0-2])$/.test(period))throw new Error('Invalid period');
 const deals=await org.collection('crmOpportunities').limit(201).get();
 if(deals.size>200)throw new Error('Report requires pagination for larger workspaces');
 const records=deals.docs.map(d=>({id:d.id,...d.data()}));
 const closed=records.filter(d=>['won','lost'].includes(d.stage)&&
  typeof d.closedAt==='string'&&d.closedAt.slice(0,7)===period);
 const snapshots=await Promise.all(closed.map(d=>
  org.collection('crmOpportunities').doc(d.id).collection('history').limit(101).get()));
 if(snapshots.some(x=>x.size>100))throw new Error('Opportunity history exceeds safe reporting limit');
 const histories=Object.fromEntries(closed.map((d,i)=>[d.id,snapshots[i].docs.map(x=>x.data())]));
 return crmSalesCycleReport(records,histories,period);
});

export const getCrmConversionReport = callable(async request=>{
 const {org}=await authorize(request,'crm');
 const period=request.data.period;
 if(typeof period!=='string'||!/^\d{4}-(0[1-9]|1[0-2])$/.test(period))throw new Error('Invalid period');
 const deals=await org.collection('crmOpportunities').limit(501).get();
 if(deals.size>500)throw new Error('Conversion analysis requires pagination');
 return crmConversionReport(deals.docs.map(d=>d.data()),period);
});

export const listCrmRecordsPage = callable(async request=>{
 const {org}=await authorize(request,'crm');
 const collections={contacts:'contacts',opportunities:'crmOpportunities',
  activities:'crmActivities',campaigns:'crmCampaigns',followUps:'crmFollowUps'};
 const kind=request.data?.kind;
 if(!Object.hasOwn(collections,kind))throw new Error('Unsupported CRM record type');
 const pageSize=validateCrmPageSize(request.data?.pageSize??50);
 let query=org.collection(collections[kind]).orderBy(FieldPath.documentId()).limit(pageSize+1);
 const afterId=request.data?.afterId;
 if(afterId!==undefined&&afterId!==null){
  const last=await org.collection(collections[kind]).doc(identifier(afterId)).get();
  if(!last.exists)throw new Error('Pagination cursor is no longer available');
  query=query.startAfter(last);
 }
 const snapshot=await query.get();
 const docs=snapshot.docs.map(d=>({id:d.id,...d.data()}));
 const result=crmPageResult(docs,pageSize);
 return {kind,...result,orderedBy:'document_id'};
});

export const getCrmPipelineAging = callable(async request=>{
 const {org}=await authorize(request,'crm');
 const thresholdDays=request.data.thresholdDays??14;
 const deals=await org.collection('crmOpportunities').limit(201).get();
 if(deals.size>200)throw new Error('Aging report requires pagination for this workspace');
 const rows=deals.docs.map(d=>({id:d.id,...d.data()}));
 return crmAgingReport(rows,new Date().toISOString(),thresholdDays);
});

export const getCrmPipelinePage = callable(async request=>{
 const {org}=await authorize(request,'crm');
 const requested=request.data?.pageSize??50;
 if(!Number.isInteger(requested)||requested<1||requested>100)
  throw new Error('Page size must be between 1 and 100');
 const cursor=request.data?.afterId;
 let query=org.collection('crmOpportunities')
  .orderBy(FieldPath.documentId()).limit(requested+1);
 if(cursor!==undefined&&cursor!==null){
  const afterId=identifier(cursor);
  const last=await org.collection('crmOpportunities').doc(afterId).get();
  if(!last.exists)throw new Error('Pagination cursor no longer exists');
  query=query.startAfter(last);
 }
 const snapshot=await query.get();
 const hasMore=snapshot.size>requested;
 const visible=snapshot.docs.slice(0,requested);
 return {opportunities:visible.map(d=>({id:d.id,...d.data()})),
  nextCursor:hasMore?visible[visible.length-1].id:null,hasMore,
  pageSize:requested,orderedBy:'document_id',
  note:'Paginated opportunities, not a complete revenue or forecasting snapshot.'};
});

export const getCrmPipeline = callable(async request=>{
 const {org}=await authorize(request,'crm');
 const [deals,tasks]=await Promise.all([
  org.collection('crmOpportunities').limit(200).get(),
  org.collection('crmFollowUps').limit(200).get()]);
 const opportunities=deals.docs.map(d=>({id:d.id,...d.data()}));
 const followUps=tasks.docs.map(d=>({id:d.id,...d.data()}));
 return {opportunities,followUps,summary:crmPipelineSummary(opportunities),
  board:crmBoardMetrics(opportunities,followUps,new Date().toISOString()),
  truncated:deals.size===200||tasks.size===200};
});

export const getCatalog = callable(async request => {
  uid(request);
  return {catalog, pricing: 'Provisional KES monthly prices; 10% for 3–5 apps, 20% for 6+.'};
});

export const createOrganization = callable(async request => {
  const user = uid(request);
  const name = textValue(request.data.name);
  const org = root(user);
  await db.runTransaction(async tx => {
    if ((await tx.get(org)).exists) return;
    tx.create(org, {name, createdAt: stamp(), owner: user, currency: 'KES'});
    tx.create(org.collection('members').doc(user), {role: 'owner', apps: []});
    tx.set(db.doc(`users/${user}`), {orgId: user});
  });
  return {orgId: user};
});

export const grantMember = callable(async request => {
  const {org, user} = await authorize(request, null, true);
  const target = request.data.email ? (await getAuth().getUserByEmail(textValue(request.data.email, 254))).uid : identifier(request.data.uid);
  if (target === user) throw new Error('Cannot change your own membership');
  const apps = request.data.apps;
  if (!Array.isArray(apps) || apps.some(a => !Object.hasOwn(catalog, a))) throw new Error('Invalid app permissions');
  await org.collection('members').doc(target).set({role: 'member', apps: [...new Set(apps)], updatedAt: stamp()});
  return {ok: true};
});

export const getWorkspaceContext = callable(async request => {
  const {org, user, member} = await authorize(request);
  return {orgId: org.id, uid: user, role: member.role, apps: member.apps || [], name: (await org.get()).data().name};
});

export const installApp = callable(async request => {
  const {org} = await authorize(request, null, true);
  const requested = identifier(request.data.appId);
  const appIds = expandRequiredApps([requested]);
  const refs = appIds.map(id => org.collection('apps').doc(id));
  await db.runTransaction(async tx => {
    const existing = await Promise.all(refs.map(ref => tx.get(ref)));
    existing.forEach((snap, index) => {
      if (snap.exists) return;
      const id = appIds[index];
      tx.create(refs[index], {
        appId: id,
        state: 'trial',
        installedAt: stamp(),
        installedAsDependencyOf: id === requested ? null : requested,
        expiresAt: Timestamp.fromMillis(Date.now() + 14 * 86400000),
        shares: catalog[id].shares
      });
    });
  });
  return {ok: true, installed: appIds};
});

export const uninstallApp = callable(async request => {
  const {org} = await authorize(request, null, true);
  const app = identifier(request.data.appId);
  if (!Object.hasOwn(catalog, app)) throw new Error('Unknown app');
  const installed = await org.collection('apps').get();
  const blockers = installed.docs
    .map(d => d.id)
    .filter(id => id !== app && (catalog[id]?.requires || []).includes(app));
  if (blockers.length) throw new Error(`Cannot uninstall ${app}; required by ${blockers.join(', ')}`);
  await org.collection('apps').doc(app).delete();
  return {ok: true};
});

export const getQuote = callable(async request => {
  await authorize(request, null, true);
  return quote(request.data.apps);
});

const topLevelCollectionByApp = Object.freeze({
  crm: 'contacts',
  inventory: 'products',
  hr: 'employees',
  projects: 'projects',
  helpdesk: 'tickets',
  hospital: 'patients',
  school: 'students',
  property: 'properties',
  sacco: 'sacco_members',
  marketing: 'marketing_campaigns',
  bookings: 'appointments',
  ecommerce: 'ecommerce_orders',
  procurement: 'procurement_pos',
  manufacturing: 'work_orders',
  fieldservice: 'field_dispatches',
  fleet: 'fleet_trips',
  hotel: 'hotel_rooms',
  restaurant: 'restaurant_orders',
  ngo: 'grants',
  documents: 'documents'
});

export const saveRecord = callable(async request => {
  const app = identifier(request.data.appId);
  if (!Object.hasOwn(catalog, app)) throw new Error('Unknown app');
  const {org, user} = await authorize(request, app);
  const id = identifier(request.data.id || randomUUID());
  const input = request.data.record;
  if (['pos', 'accounting', 'payments', 'etims'].includes(app)) throw new Error('Use the dedicated workflow for this app');

  let data = sanitizeRecord(input);
  let collection = org.collection(topLevelCollectionByApp[app] || app);
  if (app === 'crm') {
    data.email = input.email ? textValue(input.email, 254) : '';
  } else if (app === 'inventory') {
    data.price = money(input.price);
    if (!Number.isSafeInteger(input.stock) || input.stock < 0 || input.stock > 10000000) throw new Error('Invalid stock');
    data.stock = input.stock;
  }
  data = {...data, updatedAt: stamp(), updatedBy: user};
  if (app === 'inventory') {
    // Initial warehouse stock must be created together with the product.
    // Subsequent quantities are managed through dedicated stock transactions.
    const warehouseId = identifier(input.warehouseId || 'main');
    const warehouseRef = org.collection('warehouseStock').doc(`${warehouseId}__${id}`);
    const productRef = collection.doc(id);
    await db.runTransaction(async tx => {
      const [existing, warehouse] = await Promise.all([tx.get(productRef), tx.get(warehouseRef)]);
      if (existing.exists || warehouse.exists) {
        throw new Error('Existing inventory cannot be overwritten; use stock movement workflows');
      }
      tx.create(productRef, {...data, warehouseId, sku: id});
      tx.create(warehouseRef, {warehouseId, sku: id, quantity: input.stock, createdAt: stamp(), updatedAt: stamp()});
    });
    return {id};
  }
  await collection.doc(id).set(data, {merge: true});
  return {id};
});

export const saveModuleRecord = callable(async request => {
  const app = identifier(request.data.appId);
  const {org, user, member} = await authorize(request, app);
  // Until profession-specific clinician/educator/payroll RBAC is available,
  // sensitive records are owner-write only rather than permitting every
  // generic app member to alter prescriptions, grades or payroll.
  const ownerWriteKinds = {hospital: ['prescription', 'clinicalNote', 'labTest'],
    school: ['grade'], hr: ['payRun']};
  if (ownerWriteKinds[app]?.includes(request.data.kind) && member.role !== 'owner') {
    const assignment = (await org.collection('professionalAssignments').doc(user).get()).data();
    const permissions = {hospital:{prescription:'clinical:write',clinicalNote:'clinical:write',labTest:'lab:write'},
      school:{grade:'grade:write'}};
    const permission=permissions[app]?.[request.data.kind];
    if(!permission)throw new HttpsError('permission-denied','Owner required');
    try{requireVerticalPermission({app,member,assignment,permission});}
    catch{throw new HttpsError('permission-denied','Professional assignment required');}
  }
  const {record, reference} = prepareModuleRecord(app, request.data.kind, request.data.record);
  if(member.role!=='owner' && ((app==='hospital' && ['prescription','clinicalNote','labTest'].includes(record.kind)) ||
      (app==='school' && record.kind==='grade'))){
    const assignment=(await org.collection('professionalAssignments').doc(user).get()).data();
    let studentClass;
    if(app==='school'){
      const student=(await org.collection('students').doc(record.studentId).get()).data();
      studentClass=student?.className;
    }
    try{requireRecordScope({app,member,assignment,record,studentClass});}
    catch{throw new HttpsError('permission-denied','Record is outside professional assignment');}
  }
  const id = identifier(request.data.id || randomUUID());
  const target = org.collection('modules').doc(app).collection('records').doc(id);
  await db.runTransaction(async tx => {
    const existing = await tx.get(target);
    if (existing.exists && existing.data().kind !== record.kind) throw new Error('Record type cannot change');
    if (reference) {
      const parent = await tx.get(org.collection(reference[1]).doc(record[reference[0]]));
      if (!parent.exists) throw new Error('Select an existing record in this organization');
    }
    tx.set(target, {...record, updatedAt: stamp(), updatedBy: user,
      ...(existing.exists ? {} : {createdAt: stamp(), createdBy: user})}, {merge: true});
  });
  return {id};
});

// Separate lifecycle records retain authorization and a transition history.
// Clinical notes and student scores are not exposed in the response.
export const setProfessionalAssignment = callable(async request=>{
 const app=identifier(request.data.appId);
 if(!['hospital','school'].includes(app))throw new Error('Unsupported professional app');
 const {org,member,user}=await authorize(request,app,true);
 const staffUid=identifier(request.data.staffUid);
 const role=request.data.role;
 const options=app==='hospital'?['clinician','receptionist','lab_technician']:['teacher','principal'];
 if(!options.includes(role))throw new Error('Unknown professional role');
 if(typeof request.data.active!=='boolean')throw new Error('Active flag required');
 const staff=await org.collection('members').doc(staffUid).get();
 if(!staff.exists)throw new Error('Assign an existing organization member');
 const patientIds=request.data.patientIds??[],classNames=request.data.classNames??[];
 if(!Array.isArray(patientIds)||!Array.isArray(classNames)||patientIds.length>200||classNames.length>100)
   throw new Error('Invalid professional scope');
 const scopePatients=patientIds.map(identifier);
 const scopeClasses=classNames.map(name=>textValue(name,100));
 if((app==='hospital'&&scopeClasses.length)||(app==='school'&&scopePatients.length))
   throw new Error('Scope does not match professional app');
 await org.collection('professionalAssignments').doc(staffUid).set({
  app,role,active:request.data.active,patientIds:scopePatients,classNames:scopeClasses,
  assignedBy:user,updatedAt:stamp()
 });
 return {staffUid,app,role,active:request.data.active};
});
async function authorizeVerticalProfessional(org,member,user,app,permission){
 const assignment=(await org.collection('professionalAssignments').doc(user).get()).data();
 try{return requireVerticalPermission({app,member,assignment,permission});}
 catch{throw new HttpsError('permission-denied','Professional role or permission required');}
}
export const advanceClinicalEncounter = callable(async request => {
 const {org,user,member}=await authorize(request,'hospital');
 await authorizeVerticalProfessional(org,member,user,'hospital','encounter:advance');
 const id=identifier(request.data.encounterId),next=request.data.nextStatus;
 const ref=org.collection('clinicalEncounters').doc(id);
 return db.runTransaction(async tx=>{
  const snap=await tx.get(ref);
  if(!snap.exists)throw new Error('Encounter not found');
  const prior=snap.data();
  if(member.role!=='owner'){
   const assignment=(await tx.get(org.collection('professionalAssignments').doc(user))).data();
   try{requireRecordScope({app:'hospital',member,assignment,record:prior});}
   catch{throw new HttpsError('permission-denied','Encounter outside assigned patient roster');}
  }
  const status=transitionEncounter(prior.status,next);
  tx.update(ref,{status,updatedAt:stamp(),updatedBy:user});
  tx.create(org.collection('clinicalEncounterEvents').doc(randomUUID()),
    {encounterId:id,from:prior.status,to:status,actor:user,at:stamp()});
  return {encounterId:id,status};
 });
});
export const createClinicalEncounter = callable(async request=>{
 const {org,user,member}=await authorize(request,'hospital');
 await authorizeVerticalProfessional(org,member,user,'hospital','encounter:create');
 const id=identifier(request.data.encounterId),patientId=identifier(request.data.patientId);
 const ref=org.collection('clinicalEncounters').doc(id);
 await db.runTransaction(async tx=>{
  const patient=await tx.get(org.collection('patients').doc(patientId));
  if(!patient.exists)throw new Error('Patient not found');
  if(member.role!=='owner'){
   const assignment=(await tx.get(org.collection('professionalAssignments').doc(user))).data();
   try{requireRecordScope({app:'hospital',member,assignment,record:{patientId}});}
   catch{throw new HttpsError('permission-denied','Patient outside assigned roster');}
  }
  tx.create(ref,{patientId,status:'scheduled',createdBy:user,createdAt:stamp()});
 });
 return {encounterId:id,status:'scheduled'};
});
export const publishSchoolAssessment = callable(async request=>{
 const {org,user,member}=await authorize(request,'school');
 await authorizeVerticalProfessional(org,member,user,'school',request.data.nextStatus==='published'?'assessment:publish':'assessment:review');
 const id=identifier(request.data.assessmentId);
 const ref=org.collection('schoolAssessments').doc(id);
 return db.runTransaction(async tx=>{
  const snap=await tx.get(ref);
  if(!snap.exists)throw new Error('Assessment not found');
  if(member.role!=='owner'){
   const [student,assignment]=await Promise.all([
    tx.get(org.collection('students').doc(snap.data().studentId)),
    tx.get(org.collection('professionalAssignments').doc(user))]);
   try{requireRecordScope({app:'school',member,assignment:assignment.data(),record:snap.data(),studentClass:student.data()?.className});}
   catch{throw new HttpsError('permission-denied','Assessment outside assigned class');}
  }
  const status=transitionAssessment(snap.data().status,request.data.nextStatus);
  tx.update(ref,{status,updatedBy:user,updatedAt:stamp()});
  tx.create(org.collection('assessmentAuditEvents').doc(randomUUID()),{
   assessmentId:id,from:snap.data().status,to:status,actor:user,at:stamp()});
  return {assessmentId:id,status};
 });
});
export const createSchoolAssessment = callable(async request=>{
 const {org,user,member}=await authorize(request,'school');
 await authorizeVerticalProfessional(org,member,user,'school','assessment:create');
 const id=identifier(request.data.assessmentId),studentId=identifier(request.data.studentId);
 const result=assessmentScore(request.data.score,request.data.maxScore);
 await db.runTransaction(async tx=>{
  const student=await tx.get(org.collection('students').doc(studentId));
  if(!student.exists)throw new Error('Student not found');
  if(member.role!=='owner'){
   const assignment=(await tx.get(org.collection('professionalAssignments').doc(user))).data();
   try{requireRecordScope({app:'school',member,assignment,record:{studentId},studentClass:student.data()?.className});}
   catch{throw new HttpsError('permission-denied','Student outside assigned class');}
  }
  tx.create(org.collection('schoolAssessments').doc(id),{studentId,...result,status:'draft',
   createdBy:user,createdAt:stamp()});
 });
 return {assessmentId:id,status:'draft',percentBasisPoints:result.percentBasisPoints};
});

export const scheduleHospitalResource = callable(async request=>{
 const {org,user,member}=await authorize(request,'hospital');
 await authorizeVerticalProfessional(org,member,user,'hospital','encounter:create');
 const id=identifier(request.data.bookingId),patientId=identifier(request.data.patientId);
 const resourceId=identifier(request.data.resourceId);
 const ref=org.collection('hospitalResourceBookings').doc(id);
 const existing=await org.collection('hospitalResourceBookings').where('resourceId','==',resourceId).limit(501).get();
 if(existing.size>500)throw new Error('Resource booking scan requires pagination');
 const booking=validateAppointment({...request.data,resourceId},
   existing.docs.map(d=>d.data()));
 const patient=await org.collection('patients').doc(patientId).get();
 if(!patient.exists)throw new Error('Patient not found');
 if(member.role!=='owner'){
  const assignment=(await org.collection('professionalAssignments').doc(user).get()).data();
  try{requireRecordScope({app:'hospital',member,assignment,record:{patientId}});}
  catch{throw new HttpsError('permission-denied','Patient outside assigned roster');}
 }
 // An owner-managed schedule is a planning record; simultaneous schedulers
 // still require a serialized resource-slot lock to eliminate race conditions.
 await ref.create({...booking,patientId,status:'scheduled',createdBy:user,createdAt:stamp()});
 return {bookingId:id,status:'scheduled',conflictScanNotSerialized:true};
});
export const recordSchoolAttendance = callable(async request=>{
 const {org,user,member}=await authorize(request,'school');
 await authorizeVerticalProfessional(org,member,user,'school','assessment:create');
 const studentId=identifier(request.data.studentId);
 const result=validateAttendance({...request.data,studentId});
 const student=await org.collection('students').doc(studentId).get();
 if(!student.exists)throw new Error('Student not found');
 if(member.role!=='owner'){
  const assignment=(await org.collection('professionalAssignments').doc(user).get()).data();
  try{requireRecordScope({app:'school',member,assignment,record:{studentId},studentClass:student.data().className});}
  catch{throw new HttpsError('permission-denied','Student outside assigned class');}
 }
 const ref=org.collection('schoolAttendance').doc(studentId+'_'+result.date);
 await ref.create({...result,className:student.data().className||'',recordedBy:user,recordedAt:stamp()});
 return {studentId,date:result.date,status:result.status};
});

export const createSale = callable(async request => {
  const {org, user} = await authorize(request, 'pos');
  const id = identifier(request.data.requestId);
  const productRef = org.collection('products').doc(identifier(request.data.productId));
  const contactRef = org.collection('contacts').doc(identifier(request.data.contactId));
  const saleRef = org.collection('sales').doc(id);
  return db.runTransaction(async tx => {
    const [existing, productSnap, contactSnap] = await Promise.all([tx.get(saleRef), tx.get(productRef), tx.get(contactRef)]);
    if (existing.exists) {
      const prior = existing.data();
      if (prior.productId !== productRef.id || prior.contactId !== contactRef.id ||
          prior.quantity !== request.data.quantity) throw new Error('Sale request ID already used for different inputs');
      return {id, total: prior.total};
    }
    if (!productSnap.exists || !contactSnap.exists) throw new Error('Select an existing product and customer');
    const product = productSnap.data();
    const total = saleTotal(product, request.data.quantity);
    const warehouseId = identifier(product.warehouseId || 'main');
    const warehouseRef = org.collection('warehouseStock').doc(`${warehouseId}__${productRef.id}`);
    const warehouse = await tx.get(warehouseRef);
    if (!warehouse.exists) throw new Error('Warehouse balance missing; migrate legacy inventory before sale');
    const available = warehouse.data().quantity;
    if (!Number.isSafeInteger(available) || available < request.data.quantity) {
      throw new Error('Insufficient warehouse stock');
    }
    // When batches are tracked, use FEFO and update every chosen lot inside
    // the same transaction. Reject incomplete lot coverage rather than silently
    // bypassing traceability.
    const tracked = await tx.get(org.collection('inventoryBatches')
      .where('warehouseId', '==', warehouseId).where('sku', '==', productRef.id));
    let batchAllocations = [];
    if (!tracked.empty) {
      const {allocateBatchesFEFO} = await import('./inventory_batches_domain.js');
      batchAllocations = allocateBatchesFEFO({
        quantity: request.data.quantity,
        batches: tracked.docs.map(d => ({batchId: d.data().batchId, quantity: d.data().quantity,
          expiryAt: d.data().expiryAt || null}))
      }).allocations;
      for (const allocation of batchAllocations) {
        const lot = tracked.docs.find(d => d.data().batchId === allocation.batchId);
        tx.update(lot.ref, {quantity: lot.data().quantity - allocation.quantity, updatedAt: stamp()});
      }
    }
    tx.update(warehouseRef, {quantity: available - request.data.quantity, updatedAt: stamp()});
    tx.update(productRef, {stock: product.stock - request.data.quantity, updatedAt: stamp()});
    const receiptSnapshot=buildPosSaleSnapshot({saleId:id,productId:productRef.id,productName:product.name,contactId:contactRef.id,quantity:request.data.quantity,unitPriceMinor:product.price,totalMinor:total,warehouseId});
    tx.create(saleRef, {productId: productRef.id, contactId: contactRef.id, quantity: request.data.quantity, total, currency: 'KES', paymentState: 'unpaid', receiptSnapshot, batchAllocations, createdAt: stamp(), createdBy: user});
    tx.create(org.collection('events').doc(`sale_${id}`), {type: 'sale.created', saleId: id, createdAt: stamp()});
    return {id, total};
  });
});

export const openPosTill = callable(async request=>{
 const {org,user}=await authorize(request,'pos');
 const tillId=identifier(request.data.tillId);
 const openingMinor=money(request.data.openingMinor);
 const ref=org.collection('posTills').doc(tillId);
 await ref.create({cashierUid:user,status:'open',openingMinor,currency:'KES',openedAt:stamp()});
 return {tillId,status:'open',openingMinor};
});
export const recordPosTillMovement = callable(async request=>{
 const {org,user}=await authorize(request,'pos');
 const tillId=identifier(request.data.tillId),movementId=identifier(request.data.movementId);
 const amountMinor=money(request.data.amountMinor),type=request.data.type;
 if(!['cash_in','cash_out'].includes(type)||amountMinor<=0)throw new Error('Invalid cash movement');
 const reason=textValue(request.data.reason,200);
 const till=org.collection('posTills').doc(tillId);
 const movement=till.collection('movements').doc(movementId);
 return db.runTransaction(async tx=>{
  const [state,prior]=await Promise.all([tx.get(till),tx.get(movement)]);
  if(!state.exists||state.data().status!=='open'||state.data().cashierUid!==user)
   throw new HttpsError('permission-denied','Own open till required');
  if(prior.exists){
   if(prior.data().amountMinor!==amountMinor||prior.data().type!==type||prior.data().reason!==reason)
    throw new Error('Conflicting till movement ID');
   return {movementId,replayed:true};
  }
  tx.create(movement,{type,amountMinor,reason,cashierUid:user,createdAt:stamp(),
    verified:false,source:'manual_adjustment'});
  return {movementId,replayed:false};
 });
});
export const closePosTill = callable(async request=>{
 const {org,user}=await authorize(request,'pos');
 const tillId=identifier(request.data.tillId),countedMinor=money(request.data.countedMinor);
 const till=org.collection('posTills').doc(tillId);
 // Explicitly bounded movement list; no implicit cash attribution from unpaid
 // sales, M-Pesa initiations or unverified payment status.
 return db.runTransaction(async tx=>{
  const state=await tx.get(till);
  if(!state.exists||state.data().cashierUid!==user)
   throw new HttpsError('permission-denied','Till owner required');
  if(state.data().status==='closed'){
   if(state.data().reconciliation?.countedMinor!==countedMinor)throw new Error('Till closed with different count');
   return {tillId,...state.data().reconciliation,replayed:true};
  }
  if(state.data().status!=='open')throw new Error('Till unavailable');
  const movements=await tx.get(till.collection('movements').limit(1001));
  if(movements.size>1000)throw new Error('Till exceeds reconciliation movement limit');
  const reconciliation=tillReconciliation(state.data().openingMinor,
   movements.docs.map(doc=>doc.data()),countedMinor);
  tx.update(till,{status:'closed',closedAt:stamp(),closedBy:user,reconciliation});
  return {tillId,...reconciliation,replayed:false};
 });
});

export const scheduleHrShift = callable(async request=>{
 const {org,user,member}=await authorize(request,'hr');
 if(member.role!=='owner')throw new HttpsError('permission-denied','HR owner required');
 const shift=validateShift(request.data),id=identifier(request.data.shiftId||randomUUID());
 const employeeRef=org.collection('employees').doc(shift.employeeId);
 const ref=org.collection('hrShifts').doc(id);
 return db.runTransaction(async tx=>{
  const [employee,existing,shifts,leaves]=await Promise.all([
   tx.get(employeeRef),tx.get(ref),
   tx.get(org.collection('hrShifts').where('employeeId','==',shift.employeeId).limit(501)),
   tx.get(org.collection('hrLeaveRequests').where('employeeId','==',shift.employeeId).limit(501))
  ]);
  if(!employee.exists)throw new Error('Employee not found');
  if(existing.exists)throw new Error('Shift ID already exists');
  if(shifts.size>500||leaves.size>500)throw new Error('Employee schedule history exceeds safe conflict scan');
  shiftConflicts(shift,shifts.docs.map(d=>d.data()),leaves.docs.map(d=>d.data()));
  tx.update(employeeRef,{shiftRevision:FieldValue.increment(1)});
  tx.create(ref,{...shift,createdBy:user,createdAt:stamp()});
  return {shiftId:id,status:'scheduled'};
 });
});
export const cancelHrShift = callable(async request=>{
 const {org,user,member}=await authorize(request,'hr');
 if(member.role!=='owner')throw new HttpsError('permission-denied','HR owner required');
 const id=identifier(request.data.shiftId),ref=org.collection('hrShifts').doc(id);
 return db.runTransaction(async tx=>{
  const shift=await tx.get(ref);
  if(!shift.exists)throw new Error('Shift unavailable');
  const updated=changeShiftStatus(shift.data(),'cancelled');
  tx.update(ref,{...updated,cancelledBy:user,cancelledAt:stamp()});
  return {shiftId:id,status:'cancelled'};
 });
});
export const listMyHrShifts = callable(async request=>{
 const {org,user,member}=await authorize(request,'hr');
 const employeeId=identifier(request.data.employeeId);
 const employee=await org.collection('employees').doc(employeeId).get();
 if(!employee.exists||member.role!=='owner'&&employee.data().portalUid!==user)
  throw new HttpsError('permission-denied','Employee schedule not available');
 const result=await org.collection('hrShifts').where('employeeId','==',employeeId).limit(100).get();
 return {shifts:result.docs.map(d=>({id:d.id,...d.data()})),
  note:'Scheduled shifts are not verified attendance or payable overtime.'};
});

export const getHrShiftAttendanceReconciliation = callable(async request=>{
 const {org,user,member}=await authorize(request,'hr');
 const employeeId=identifier(request.data.employeeId);
 const employee=await org.collection('employees').doc(employeeId).get();
 if(!employee.exists||member.role!=='owner'&&employee.data().portalUid!==user)
  throw new HttpsError('permission-denied','Employee attendance is restricted');
 const portalUid=employee.data().portalUid;
 if(typeof portalUid!=='string'||!portalUid)throw new Error('Employee attendance identity not linked');
 const shifts=await org.collection('hrShifts').where('employeeId','==',employeeId).limit(101).get();
 if(shifts.size>100)throw new Error('Too many shifts for bounded reconciliation');
 const results=[];
 for(const doc of shifts.docs){
  const shift=doc.data();
  if(shift.status!=='scheduled')continue;
  const date=shift.startAt.slice(0,10);
  const nextDate=new Date(Date.parse(date+'T00:00:00Z')+86400000).toISOString().slice(0,10);
  const punchIds=[portalUid+'_'+date,portalUid+'_'+nextDate];
  const punches=await Promise.all(punchIds.map(id=>org.collection('attendancePunches').doc(id).get()));
  results.push({shiftId:doc.id,startAt:shift.startAt,endAt:shift.endAt,
   ...reconcileShiftPunches(shift,punches.filter(x=>x.exists&&x.data().employeeUid===portalUid)
    .map(x=>({id:x.id,...x.data()})),{graceMinutes:5})});
 }
 return {employeeId,results,
  payrollReady:false,
  note:'Observations rely on self-recorded attendance punches; not payroll-authorized hours or approved overtime.'};
});

export const submitHrTimesheet = callable(async request=>{
 const {org,user}=await authorize(request,'hr');
 const shiftId=identifier(request.data.shiftId),ref=org.collection('hrShifts').doc(shiftId);
 const sheetRef=org.collection('hrTimesheets').doc(shiftId);
 return db.runTransaction(async tx=>{
  const shift=await tx.get(ref);
  if(!shift.exists)throw new Error('Shift not found');
  const employee=await tx.get(org.collection('employees').doc(identifier(shift.data().employeeId)));
  if(!employee.exists||employee.data().portalUid!==user)
   throw new HttpsError('permission-denied','Only the scheduled employee may submit');
  const date=shift.data().startAt.slice(0,10);
  const nextDate=new Date(Date.parse(date+'T00:00:00Z')+86400000).toISOString().slice(0,10);
  const punches=await Promise.all([date,nextDate].map(day=>tx.get(
   org.collection('attendancePunches').doc(user+'_'+day))));
  const evidence=reconcileShiftPunches(shift.data(),
   punches.filter(d=>d.exists&&d.data().employeeUid===user).map(d=>({id:d.id,...d.data()})));
  const proposed=draftTimesheet({id:shiftId,...shift.data()},evidence,
   request.data.unpaidBreakMinutes,request.data.reason);
  if((await tx.get(sheetRef)).exists)throw new Error('Timesheet already submitted');
  tx.create(sheetRef,{...proposed,submittedBy:user,submittedAt:stamp()});
  return {timesheetId:shiftId,status:'pending',netMinutes:proposed.netMinutes};
 });
});
export const decideHrTimesheet = callable(async request=>{
 const {org,user,member}=await authorize(request,'hr');
 if(member.role!=='owner')throw new HttpsError('permission-denied','HR owner review required');
 const id=identifier(request.data.timesheetId),ref=org.collection('hrTimesheets').doc(id);
 return db.runTransaction(async tx=>{
  const sheet=await tx.get(ref);
  if(!sheet.exists)throw new Error('Timesheet not found');
  const shift=await tx.get(org.collection('hrShifts').doc(id));
  if(!shift.exists)throw new Error('Timesheet shift missing');
  const period=shift.data().startAt.slice(0,7);
  if((await tx.get(org.collection('hrPayrollTimeLocks').doc(sheet.data().employeeId+'_'+period))).exists)
   throw new Error('Payroll time period locked; controlled correction required');
  const decision=decideTimesheet(sheet.data(),request.data.status,request.data.note);
  if(sheet.data().submittedBy===user)
   throw new HttpsError('permission-denied','Cannot approve or reject own timesheet');
  tx.update(ref,{...decision,decidedBy:user,decidedAt:stamp()});
  tx.create(ref.collection('history').doc(randomUUID()),{
   from:'pending',to:decision.status,actor:user,note:decision.decisionNote,at:stamp()});
  return {timesheetId:id,status:decision.status,payrollPosted:false};
 });
});
export const requestHrOvertime = callable(async request=>{
 const {org,user}=await authorize(request,'hr');
 const timesheetId=identifier(request.data.timesheetId);
 const sheetRef=org.collection('hrTimesheets').doc(timesheetId);
 const shiftRef=org.collection('hrShifts').doc(timesheetId);
 const overtimeRef=org.collection('hrOvertimeRequests').doc(timesheetId);
 return db.runTransaction(async tx=>{
  const [sheet,shift,prior]=await Promise.all([
   tx.get(sheetRef),tx.get(shiftRef),tx.get(overtimeRef)]);
  if(!sheet.exists||!shift.exists)throw new Error('Timesheet or shift missing');
  const employee=await tx.get(org.collection('employees').doc(identifier(sheet.data().employeeId)));
  if(!employee.exists||employee.data().portalUid!==user)
   throw new HttpsError('permission-denied','Only employee may request overtime');
  if(prior.exists)throw new Error('Overtime request already exists for shift');
  const proposal=proposeOvertime(sheet.data(),{id:timesheetId,...shift.data()},
   request.data.minutes,request.data.reason);
  tx.create(overtimeRef,{...proposal,submittedBy:user,submittedAt:stamp()});
  return {overtimeId:timesheetId,status:'pending',minutes:proposal.minutes};
 });
});
export const decideHrOvertime = callable(async request=>{
 const {org,user,member}=await authorize(request,'hr');
 if(member.role!=='owner')throw new HttpsError('permission-denied','HR owner approval required');
 const id=identifier(request.data.overtimeId),ref=org.collection('hrOvertimeRequests').doc(id);
 return db.runTransaction(async tx=>{
  const previous=await tx.get(ref);
  if(!previous.exists)throw new Error('Overtime request unavailable');
  if(previous.data().submittedBy===user)
   throw new HttpsError('permission-denied','Self-approval prohibited');
  const shift=await tx.get(org.collection('hrShifts').doc(id));
  if(!shift.exists)throw new Error('Overtime shift missing');
  const period=shift.data().startAt.slice(0,7);
  if((await tx.get(org.collection('hrPayrollTimeLocks').doc(previous.data().employeeId+'_'+period))).exists)
   throw new Error('Payroll time period locked; controlled correction required');
  const decision=decideOvertime(previous.data(),request.data.status,request.data.note);
  tx.update(ref,{...decision,decidedBy:user,decidedAt:stamp()});
  tx.create(ref.collection('audit').doc(randomUUID()),{
   from:'pending',to:decision.status,actor:user,note:decision.decisionNote,at:stamp()});
  return {overtimeId:id,status:decision.status,payrollPosted:false};
 });
});
export const getHrPayrollTimeRegister = callable(async request=>{
 const {org,member}=await authorize(request,'hr');
 if(member.role!=='owner')throw new HttpsError('permission-denied','HR owner required');
 const employeeId=identifier(request.data.employeeId),period=request.data.period;
 if(typeof period!=='string'||!/^\d{4}-(0[1-9]|1[0-2])$/.test(period))
  throw new Error('Invalid payroll period');
 const [employee,sheets,overtime,shifts]=await Promise.all([
  org.collection('employees').doc(employeeId).get(),
  org.collection('hrTimesheets').where('employeeId','==',employeeId).limit(501).get(),
  org.collection('hrOvertimeRequests').where('employeeId','==',employeeId).limit(501).get(),
  org.collection('hrShifts').where('employeeId','==',employeeId).limit(501).get()]);
 if(!employee.exists||sheets.size>500||overtime.size>500||shifts.size>500)
  throw new Error('Employee unavailable or reporting history exceeds safe bounds');
 const shiftPeriods=new Map(shifts.docs.map(d=>[d.id,d.data().startAt?.slice(0,7)]));
 const assignPeriod=(id)=>shiftPeriods.get(id)||null;
 const statement=payrollTimeRegister(period,
  sheets.docs.map(d=>({id:d.id,...d.data(),period:assignPeriod(d.data().shiftId)})),
  overtime.docs.map(d=>({id:d.id,...d.data(),period:assignPeriod(d.data().timesheetId)})));
 return {employeeId,...statement,
  note:'For HR reconciliation only. Not verified for payroll posting, wage valuation, or statutory filing.'};
});

export const lockHrPayrollTimeRegister = callable(async request=>{
 const {org,user,member}=await authorize(request,'hr');
 if(member.role!=='owner')throw new HttpsError('permission-denied','HR owner required');
 const employeeId=identifier(request.data.employeeId),period=request.data.period;
 if(typeof period!=='string'||!/^\d{4}-(0[1-9]|1[0-2])$/.test(period))throw new Error('Invalid period');
 const lockRef=org.collection('hrPayrollTimeLocks').doc(employeeId+'_'+period);
 return db.runTransaction(async tx=>{
  const [employee,existing,sheets,overtime,shifts]=await Promise.all([
   tx.get(org.collection('employees').doc(employeeId)),tx.get(lockRef),
   tx.get(org.collection('hrTimesheets').where('employeeId','==',employeeId).limit(501)),
   tx.get(org.collection('hrOvertimeRequests').where('employeeId','==',employeeId).limit(501)),
   tx.get(org.collection('hrShifts').where('employeeId','==',employeeId).limit(501))]);
  if(!employee.exists||sheets.size>500||overtime.size>500||shifts.size>500)
   throw new Error('Incomplete employee history prevents time locking');
  const periodByShift=new Map(shifts.docs.map(d=>[d.id,d.data().startAt?.slice(0,7)]));
  const register=payrollTimeRegister(period,
   sheets.docs.map(d=>({id:d.id,...d.data(),period:periodByShift.get(d.data().shiftId)})),
   overtime.docs.map(d=>({id:d.id,...d.data(),period:periodByShift.get(d.data().timesheetId)})));
  const snapshot=payrollTimeSnapshot(register);
  if(existing.exists){
   if(existing.data().digest!==snapshot.digest)
    throw new Error('Previously locked time register differs from current approved records');
   return {employeeId,period,digest:snapshot.digest,replayed:true};
  }
  tx.create(lockRef,{...snapshot,employeeId,lockedBy:user,lockedAt:stamp()});
  return {employeeId,period,digest:snapshot.digest,replayed:false};
 });
});
export const getHrPayrollTimeLock = callable(async request=>{
 const {org,member}=await authorize(request,'hr');
 if(member.role!=='owner')throw new HttpsError('permission-denied','HR owner required');
 const employeeId=identifier(request.data.employeeId),period=request.data.period;
 if(typeof period!=='string'||!/^\d{4}-(0[1-9]|1[0-2])$/.test(period))throw new Error('Invalid period');
 const record=await org.collection('hrPayrollTimeLocks').doc(employeeId+'_'+period).get();
 return record.exists?{locked:true,...record.data()}:{locked:false};
});

export const requestHrTimeCorrection = callable(async request=>{
 const {org,user}=await authorize(request,'hr');
 const employeeId=identifier(request.data.employeeId),period=request.data.period;
 if(typeof period!=='string'||!/^\d{4}-(0[1-9]|1[0-2])$/.test(period))throw new Error('Invalid period');
 const id=identifier(request.data.correctionId||randomUUID());
 const employeeRef=org.collection('employees').doc(employeeId);
 const lockRef=org.collection('hrPayrollTimeLocks').doc(employeeId+'_'+period);
 const correctionRef=org.collection('hrTimeCorrections').doc(id);
 return db.runTransaction(async tx=>{
  const [employee,lock,existing]=await Promise.all([
   tx.get(employeeRef),tx.get(lockRef),tx.get(correctionRef)]);
  if(!employee.exists||employee.data().portalUid!==user)
   throw new HttpsError('permission-denied','Only linked employee can request a correction');
  if(!lock.exists)throw new Error('Locked register required');
  if(existing.exists)throw new Error('Correction ID already exists');
  const correction=proposeHrTimeCorrection(lock.data(),request.data);
  tx.create(correctionRef,{...correction,employeeId,period,submittedBy:user,submittedAt:stamp()});
  return {correctionId:id,status:'pending'};
 });
});
export const decideHrTimeCorrection = callable(async request=>{
 const {org,user,member}=await authorize(request,'hr');
 if(member.role!=='owner')throw new HttpsError('permission-denied','HR owner required');
 const id=identifier(request.data.correctionId),ref=org.collection('hrTimeCorrections').doc(id);
 return db.runTransaction(async tx=>{
  const current=await tx.get(ref);
  if(!current.exists)throw new Error('Correction not found');
  if(current.data().submittedBy===user)
   throw new HttpsError('permission-denied','Independent reviewer required');
  const lock=await tx.get(org.collection('hrPayrollTimeLocks').doc(current.data().employeeId+'_'+current.data().period));
  if(!lock.exists||lock.data().digest!==current.data().originalDigest)
   throw new Error('Original locked register changed');
  const decision=decideHrTimeCorrection(current.data(),request.data.status,request.data.note);
  tx.update(ref,{...decision,decidedBy:user,decidedAt:stamp()});
  tx.create(ref.collection('history').doc(randomUUID()),{
   from:'pending',to:decision.status,actor:user,note:decision.decisionNote,at:stamp()});
  // Approved corrections are append-only instructions for future reconciliation.
  // The original lock, source timesheet and payroll journal remain unchanged.
  return {correctionId:id,status:decision.status,appliedToPayroll:false};
 });
});
export const listHrTimeCorrections = callable(async request=>{
 const {org,user,member}=await authorize(request,'hr');
 const employeeId=identifier(request.data.employeeId);
 const employee=await org.collection('employees').doc(employeeId).get();
 if(!employee.exists||member.role!=='owner'&&employee.data().portalUid!==user)
  throw new HttpsError('permission-denied','Correction history restricted');
 const rows=await org.collection('hrTimeCorrections').where('employeeId','==',employeeId).limit(100).get();
 return {corrections:rows.docs.map(d=>({id:d.id,period:d.data().period,
   timesheetId:d.data().timesheetId,status:d.data().status,
   regularMinutes:d.data().regularMinutes,approvedOvertimeMinutes:d.data().approvedOvertimeMinutes,
   reason:d.data().reason})),appliedToPayroll:false};
});

export const getHrAdjustedTimeRegister = callable(async request=>{
 const {org,user,member}=await authorize(request,'hr');
 const employeeId=identifier(request.data.employeeId),period=request.data.period;
 if(typeof period!=='string'||!/^\d{4}-(0[1-9]|1[0-2])$/.test(period))throw new Error('Invalid period');
 const employee=await org.collection('employees').doc(employeeId).get();
 if(!employee.exists||member.role!=='owner'&&employee.data().portalUid!==user)
  throw new HttpsError('permission-denied','HR time register restricted');
 const [lock,history]=await Promise.all([
  org.collection('hrPayrollTimeLocks').doc(employeeId+'_'+period).get(),
  org.collection('hrTimeCorrections').where('employeeId','==',employeeId).limit(501).get()]);
 if(!lock.exists)throw new Error('Original time period must be locked');
 if(history.size>500)throw new Error('Correction history exceeds safe reporting bounds');
 const corrections=history.docs.filter(doc=>doc.data().period===period)
  .map(doc=>({id:doc.id,...doc.data()}));
 const report=adjustedTimeRegister(lock.data(),corrections);
 return {employeeId,...report,
  note:'Read-only HR adjustment projection. Original snapshot unchanged; no wage calculation or payroll posting.'};
});

export const proposeHrPayrollAuthorization = callable(async request=>{
 const {org,user,member}=await authorize(request,'hr');
 if(member.role!=='owner')throw new HttpsError('permission-denied','HR owner required');
 const employeeId=identifier(request.data.employeeId),period=request.data.period;
 if(typeof period!=='string'||!/^\d{4}-(0[1-9]|1[0-2])$/.test(period))throw new Error('Invalid period');
 const proposalRef=org.collection('hrPayrollAuthorizationProposals').doc(employeeId+'_'+period);
 return db.runTransaction(async tx=>{
  const [employee,lock,prior,history]=await Promise.all([
   tx.get(org.collection('employees').doc(employeeId)),
   tx.get(org.collection('hrPayrollTimeLocks').doc(employeeId+'_'+period)),
   tx.get(proposalRef),
   tx.get(org.collection('hrTimeCorrections').where('employeeId','==',employeeId).limit(501))
  ]);
  if(!employee.exists||!lock.exists||history.size>500)
   throw new Error('Employee, locked time or complete correction history unavailable');
  const report=adjustedTimeRegister(lock.data(),history.docs.filter(d=>d.data().period===period)
   .map(d=>({id:d.id,...d.data()})));
  const proposal=payrollAuthorizationDraft(report,request.data.grossMinor,request.data.explanation);
  if(prior.exists){
   if(prior.data().registerDigest!==proposal.registerDigest||
      prior.data().grossMinor!==proposal.grossMinor)throw new Error('Existing proposal differs');
   return {proposalId:proposalRef.id,status:prior.data().status,replayed:true};
  }
  tx.create(proposalRef,{...proposal,employeeId,preparedBy:user,createdAt:stamp()});
  return {proposalId:proposalRef.id,status:'pending',replayed:false};
 });
});
export const decideHrPayrollAuthorization = callable(async request=>{
 const {org,user,member}=await authorize(request,'hr');
 if(member.role!=='owner')throw new HttpsError('permission-denied','HR owner required');
 const employeeId=identifier(request.data.employeeId),period=request.data.period;
 if(typeof period!=='string'||!/^\d{4}-(0[1-9]|1[0-2])$/.test(period))throw new Error('Invalid period');
 const ref=org.collection('hrPayrollAuthorizationProposals').doc(employeeId+'_'+period);
 return db.runTransaction(async tx=>{
  const [proposal,lock,history]=await Promise.all([
   tx.get(ref),tx.get(org.collection('hrPayrollTimeLocks').doc(employeeId+'_'+period)),
   tx.get(org.collection('hrTimeCorrections').where('employeeId','==',employeeId).limit(501))
  ]);
  if(!proposal.exists||!lock.exists||history.size>500)throw new Error('Proposal, lock or correction history missing');
  const actual=adjustedTimeRegister(lock.data(),history.docs.filter(d=>d.data().period===period)
   .map(d=>({id:d.id,...d.data()})));
  if(actual.digest!==proposal.data().registerDigest)throw new Error('Time register changed since payroll proposal');
  const decision=authorizePayrollProposal(proposal.data(),request.data.status,request.data.note,user);
  tx.update(ref,{...decision,reviewedBy:user,reviewedAt:stamp()});
  tx.create(ref.collection('audit').doc(randomUUID()),{
   action:decision.status,reviewer:user,note:decision.reviewNote,at:stamp()});
  return {proposalId:ref.id,status:decision.status,payrollPosted:false};
 });
});
export const getHrPayrollAuthorization = callable(async request=>{
 const {org,member}=await authorize(request,'hr');
 if(member.role!=='owner')throw new HttpsError('permission-denied','HR owner required');
 const employeeId=identifier(request.data.employeeId),period=request.data.period;
 if(typeof period!=='string'||!/^\d{4}-(0[1-9]|1[0-2])$/.test(period))throw new Error('Invalid period');
 const proposal=await org.collection('hrPayrollAuthorizationProposals').doc(employeeId+'_'+period).get();
 return {exists:proposal.exists,...(proposal.exists?{
  status:proposal.data().status,grossMinor:proposal.data().grossMinor,
  registerDigest:proposal.data().registerDigest,payrollPosted:false}:{})};
});

export const listHrOvertime = callable(async request=>{
 const {org,user,member}=await authorize(request,'hr');
 const employeeId=identifier(request.data.employeeId);
 const employee=await org.collection('employees').doc(employeeId).get();
 if(!employee.exists||member.role!=='owner'&&employee.data().portalUid!==user)
  throw new HttpsError('permission-denied','Overtime records restricted');
 const rows=await org.collection('hrOvertimeRequests').where('employeeId','==',employeeId).limit(100).get();
 return {requests:rows.docs.map(d=>({id:d.id,status:d.data().status,minutes:d.data().minutes,
  reason:d.data().reason,payrollPosted:false})),payrollIntegrated:false};
});

export const listHrTimesheets = callable(async request=>{
 const {org,user,member}=await authorize(request,'hr');
 const employeeId=identifier(request.data.employeeId);
 const employee=await org.collection('employees').doc(employeeId).get();
 if(!employee.exists||member.role!=='owner'&&employee.data().portalUid!==user)
  throw new HttpsError('permission-denied','Timesheet not accessible');
 const sheets=await org.collection('hrTimesheets').where('employeeId','==',employeeId).limit(100).get();
 return {timesheets:sheets.docs.map(d=>({id:d.id,status:d.data().status,
  netMinutes:d.data().netMinutes,unpaidBreakMinutes:d.data().unpaidBreakMinutes,
  payrollPosted:false})),payrollIntegrated:false};
});

export const createHrCandidate = callable(async request=>{
 const {org,user,member}=await authorize(request,'hr');
 if(member.role!=='owner')throw new HttpsError('permission-denied','HR owner required');
 const applicant=candidateApplication(request.data),id=identifier(request.data.applicationId||randomUUID());
 await org.collection('hrCandidates').doc(id).create({...applicant,createdBy:user,createdAt:stamp()});
 return {applicationId:id,stage:'applied'};
});
export const advanceHrCandidate = callable(async request=>{
 const {org,user,member}=await authorize(request,'hr');
 if(member.role!=='owner')throw new HttpsError('permission-denied','HR owner required');
 const id=identifier(request.data.applicationId),ref=org.collection('hrCandidates').doc(id);
 return db.runTransaction(async tx=>{
  const previous=await tx.get(ref);
  if(!previous.exists)throw new Error('Candidate not found');
  const update=advanceCandidate(previous.data(),request.data.stage,request.data.reason);
  tx.update(ref,{...update,updatedBy:user,updatedAt:stamp()});
  tx.create(ref.collection('history').doc(randomUUID()),{
   from:previous.data().stage,to:update.stage,reason:update.reason,actor:user,at:stamp()});
  return {applicationId:id,stage:update.stage};
 });
});
export const createHrOnboardingTask = callable(async request=>{
 const {org,user,member}=await authorize(request,'hr');
 if(member.role!=='owner')throw new HttpsError('permission-denied','HR owner required');
 const employeeId=identifier(request.data.employeeId),id=identifier(request.data.taskId||randomUUID());
 const task=onboardingTask(request.data);
 const [employee,assignee]=await Promise.all([
  org.collection('employees').doc(employeeId).get(),org.collection('members').doc(task.assigneeUid).get()]);
 if(!employee.exists||!assignee.exists)throw new Error('Employee or task assignee not found');
 await org.collection('hrOnboardingTasks').doc(id).create({...task,employeeId,createdBy:user,createdAt:stamp()});
 return {taskId:id,status:'open'};
});
export const completeHrOnboardingTask = callable(async request=>{
 const {org,user,member}=await authorize(request,'hr');
 const id=identifier(request.data.taskId),ref=org.collection('hrOnboardingTasks').doc(id);
 return db.runTransaction(async tx=>{
  const task=await tx.get(ref);
  if(!task.exists||task.data().status!=='open')throw new Error('Open onboarding task required');
  if(member.role!=='owner'&&task.data().assigneeUid!==user)
   throw new HttpsError('permission-denied','Assigned task owner required');
  tx.update(ref,{status:'completed',completedBy:user,completedAt:stamp()});
  return {taskId:id,status:'completed'};
 });
});
export const listHrRecruitment = callable(async request=>{
 const {org,member}=await authorize(request,'hr');
 if(member.role!=='owner')throw new HttpsError('permission-denied','HR owner required');
 const [candidates,tasks]=await Promise.all([
  org.collection('hrCandidates').limit(100).get(),
  org.collection('hrOnboardingTasks').limit(100).get()]);
 return {candidates:candidates.docs.map(d=>({id:d.id,...d.data()})),
  tasks:tasks.docs.map(d=>({id:d.id,...d.data()}))};
});

export const createHrPerformanceReview = callable(async request=>{
 const {org,user,member}=await authorize(request,'hr');
 if(member.role!=='owner')throw new HttpsError('permission-denied','HR owner required');
 const review=createReview(request.data),id=identifier(request.data.reviewId||randomUUID());
 const ref=org.collection('hrPerformanceReviews').doc(id);
 const [employee,manager]=await Promise.all([
  org.collection('employees').doc(review.employeeId).get(),
  org.collection('members').doc(review.managerUid).get()]);
 if(!employee.exists||!employee.data().portalUid||!manager.exists)
  throw new Error('Linked employee identity and workspace manager required');
 if(employee.data().portalUid===review.managerUid)throw new Error('Manager cannot review themself');
 await ref.create({...review,createdBy:user,createdAt:stamp()});
 return {reviewId:id,status:review.status};
});
export const submitHrPerformanceAssessment = callable(async request=>{
 const {org,user}=await authorize(request,'hr');
 const id=identifier(request.data.reviewId),kind=request.data.kind;
 if(!['employee','manager'].includes(kind))throw new Error('Unknown assessment role');
 const ref=org.collection('hrPerformanceReviews').doc(id);
 return db.runTransaction(async tx=>{
  const previous=await tx.get(ref);
  if(!previous.exists)throw new Error('Performance review unavailable');
  const record=previous.data();
  const employee=await tx.get(org.collection('employees').doc(identifier(record.employeeId)));
  if(!employee.exists)throw new Error('Employee unavailable');
  if(kind==='employee'&&employee.data().portalUid!==user||
     kind==='manager'&&record.managerUid!==user)
    throw new HttpsError('permission-denied','Assessment must be submitted by assigned participant');
  const assessment=reviewAssessment(record,kind,request.data);
  const status=kind==='employee'?'manager_review':'completed';
  tx.update(ref,{[kind==='employee'?'employeeAssessment':'managerAssessment']:assessment,
    status,updatedBy:user,updatedAt:stamp()});
  tx.create(ref.collection('history').doc(randomUUID()),{kind,actor:user,at:stamp(),
    from:record.status,to:status});
  return {reviewId:id,status,weightedScore:assessment.weightedScore};
 });
});
export const listMyHrPerformanceReviews = callable(async request=>{
 const {org,user}=await authorize(request,'hr');
 const [mine,managed]=await Promise.all([
  org.collection('employees').where('portalUid','==',user).limit(2).get(),
  org.collection('hrPerformanceReviews').where('managerUid','==',user).limit(101).get()]);
 if(mine.size>1||managed.size>100)throw new Error('Review list exceeds safe bounds');
 const employeeId=mine.empty?null:mine.docs[0].id;
 const employeeReviews=employeeId?
  await org.collection('hrPerformanceReviews').where('employeeId','==',employeeId).limit(101).get():null;
 if(employeeReviews&&employeeReviews.size>100)throw new Error('Review list exceeds safe bounds');
 const map=new Map();
 for(const doc of [...managed.docs,...(employeeReviews?.docs||[])])
  map.set(doc.id,{id:doc.id,employeeId:doc.data().employeeId,startDate:doc.data().startDate,
    endDate:doc.data().endDate,status:doc.data().status,goals:doc.data().goals,
    employeeAssessment:doc.data().employeeAssessment??null,
    managerAssessment:doc.data().managerAssessment??null,
    myRole:doc.data().managerUid===user?'manager':'employee'});
 return {reviews:[...map.values()]};
});

export const addHrContinuousFeedback = callable(async request=>{
 const {org,user}=await authorize(request,'hr');
 const reviewId=identifier(request.data.reviewId),entryId=identifier(request.data.entryId||randomUUID());
 const ref=org.collection('hrPerformanceReviews').doc(reviewId);
 const review=await ref.get();
 if(!review.exists)throw new Error('Review unavailable');
 const employee=await org.collection('employees').doc(identifier(review.data().employeeId)).get();
 if(!employee.exists)throw new Error('Employee unavailable');
 if(user!==review.data().managerUid&&user!==employee.data().portalUid)
  throw new HttpsError('permission-denied','Review participants only');
 const entry=performanceFeedback(request.data);
 await ref.collection('feedback').doc(entryId).create({...entry,createdBy:user,createdAt:stamp()});
 return {entryId,reviewId};
});
export const createHrDevelopmentPlan = callable(async request=>{
 const {org,user}=await authorize(request,'hr');
 const reviewId=identifier(request.data.reviewId),planId=identifier(request.data.planId||randomUUID());
 const ref=org.collection('hrPerformanceReviews').doc(reviewId);
 const review=await ref.get();
 if(!review.exists||review.data().managerUid!==user)
  throw new HttpsError('permission-denied','Assigned manager required');
 const plan=developmentPlan(request.data);
 await ref.collection('developmentPlans').doc(planId).create({...plan,createdBy:user,createdAt:stamp()});
 return {reviewId,planId,status:plan.status};
});
export const advanceHrDevelopmentPlan = callable(async request=>{
 const {org,user}=await authorize(request,'hr');
 const reviewId=identifier(request.data.reviewId),planId=identifier(request.data.planId);
 const reviewRef=org.collection('hrPerformanceReviews').doc(reviewId);
 const planRef=reviewRef.collection('developmentPlans').doc(planId);
 return db.runTransaction(async tx=>{
  const [review,plan]=await Promise.all([tx.get(reviewRef),tx.get(planRef)]);
  if(!review.exists||!plan.exists)throw new Error('Plan or review not found');
  if(review.data().managerUid!==user)
   throw new HttpsError('permission-denied','Assigned manager required');
  const update=advanceDevelopmentPlan(plan.data(),request.data.status);
  tx.update(planRef,{...update,updatedBy:user,updatedAt:stamp()});
  tx.create(planRef.collection('audit').doc(randomUUID()),{
   from:plan.data().status,to:update.status,actor:user,at:stamp()});
  return {reviewId,planId,status:update.status};
 });
});
export const listHrReviewGrowth = callable(async request=>{
 const {org,user}=await authorize(request,'hr');
 const reviewId=identifier(request.data.reviewId);
 const ref=org.collection('hrPerformanceReviews').doc(reviewId);
 const review=await ref.get();
 if(!review.exists)throw new Error('Review not found');
 const employee=await org.collection('employees').doc(identifier(review.data().employeeId)).get();
 if(!employee.exists||user!==review.data().managerUid&&user!==employee.data().portalUid)
  throw new HttpsError('permission-denied','Review participants only');
 const [feedback,plans]=await Promise.all([
  ref.collection('feedback').orderBy('createdAt','desc').limit(100).get(),
  ref.collection('developmentPlans').limit(100).get()]);
 return {
  feedback:feedback.docs.map(d=>({id:d.id,category:d.data().category,message:d.data().message,createdBy:d.data().createdBy})),
  plans:plans.docs.map(d=>({id:d.id,title:d.data().title,description:d.data().description,dueDate:d.data().dueDate,status:d.data().status}))
 };
});

export const requestHrLeave = callable(async request=>{
 const {org,user,member}=await authorize(request,'hr');
 const id=identifier(request.data.requestId||randomUUID());
 const leave=leaveRequest(request.data);
 const employeeRef=org.collection('employees').doc(leave.employeeId);
 const ref=org.collection('hrLeaveRequests').doc(id);
 return db.runTransaction(async tx=>{
  const [employee,prior,others]=await Promise.all([
   tx.get(employeeRef),tx.get(ref),
   tx.get(org.collection('hrLeaveRequests').where('employeeId','==',leave.employeeId).limit(501))
  ]);
  if(!employee.exists)throw new Error('Employee not found');
  if(employee.data().portalUid!==user&&member.role!=='owner')
   throw new HttpsError('permission-denied','Employee identity not linked');
  if(prior.exists)throw new Error('Leave request ID already used');
  if(others.size>500)throw new Error('Leave history exceeds safe scan');
  if(overlappingLeave(leave,others.docs.map(d=>d.data())))throw new Error('Overlapping leave request');
  // Serialize competing leave requests for the same employee.
  tx.update(employeeRef,{leaveRevision:FieldValue.increment(1)});
  tx.create(ref,{...leave,requestedBy:user,createdAt:stamp()});
  return {requestId:id,status:'requested',calendarDays:leave.calendarDays};
 });
});
export const configureHrLeavePolicy = callable(async request=>{
 const {org,user,member}=await authorize(request,'hr');
 if(member.role!=='owner')throw new HttpsError('permission-denied','HR owner required');
 const policy=validateLeavePolicy(request.data.policy);
 await org.collection('hrSettings').doc('leavePolicy').set({...policy,updatedBy:user,updatedAt:stamp()});
 return {policy};
});
export const grantHrAnnualLeave = callable(async request=>{
 const {org,user,member}=await authorize(request,'hr');
 if(member.role!=='owner')throw new HttpsError('permission-denied','HR owner required');
 const employeeId=identifier(request.data.employeeId),year=String(request.data.year);
 if(!/^\\d{4}$/.test(year))throw new Error('Invalid leave year');
 const days=request.data.days;
 if(!Number.isSafeInteger(days)||days<1||days>365)throw new Error('Invalid grant days');
 const balanceRef=org.collection('hrLeaveBalances').doc(employeeId+'_'+year);
 return db.runTransaction(async tx=>{
  const [employee,existing]=await Promise.all([tx.get(org.collection('employees').doc(employeeId)),tx.get(balanceRef)]);
  if(!employee.exists)throw new Error('Employee not found');
  if(existing.exists)throw new Error('Entitlement already initialized; adjustments require a separate audited workflow');
  tx.create(balanceRef,{employeeId,year,grantedDays:days,usedDays:0,
    createdBy:user,createdAt:stamp()});
  tx.create(org.collection('hrLeaveLedgerEvents').doc(employeeId+'_'+year+'_opening'),{
   employeeId,year,action:'grant',days,actor:user,at:stamp()});
  return {employeeId,year,grantedDays:days,remainingDays:days};
 });
});
export const configureHrAccrualPolicy = callable(async request=>{
 const {org,user,member}=await authorize(request,'hr');
 if(member.role!=='owner')throw new HttpsError('permission-denied','HR owner required');
 const policy=validateAccrualPolicy(request.data.policy);
 await org.collection('hrSettings').doc('accrualPolicy').set({...policy,updatedBy:user,updatedAt:stamp()});
 return {policy};
});
export const postHrMonthlyAccrual = callable(async request=>{
 const {org,user,member}=await authorize(request,'hr');
 if(member.role!=='owner')throw new HttpsError('permission-denied','HR owner required');
 const employeeId=identifier(request.data.employeeId),period=request.data.period;
 if(typeof period!=='string'||!/^\d{4}-(0[1-9]|1[0-2])$/.test(period))throw new Error('Invalid accrual period');
 const year=period.slice(0,4),balanceRef=org.collection('hrLeaveBalances').doc(employeeId+'_'+year);
 const eventRef=org.collection('hrLeaveLedgerEvents').doc(employeeId+'_'+period+'_accrual');
 return db.runTransaction(async tx=>{
  const [employee,policy,balance,event]=await Promise.all([
   tx.get(org.collection('employees').doc(employeeId)),
   tx.get(org.collection('hrSettings').doc('accrualPolicy')),tx.get(balanceRef),tx.get(eventRef)]);
  if(!employee.exists||!policy.exists||!balance.exists)throw new Error('Employee, accrual policy or entitlement unavailable');
  if(event.exists)return {employeeId,period,replayed:true,days:event.data().days};
  const result=accrueAnnualLeave(balance.data(),policy.data(),period);
  tx.update(balanceRef,{grantedDays:result.grantedDays,updatedAt:stamp()});
  tx.create(eventRef,{employeeId,year,period,action:'accrual',days:result.days,actor:user,at:stamp()});
  return {employeeId,period,replayed:false,days:result.days,remainingDays:result.remainingDays};
 });
});
export const carryForwardHrAnnualLeave = callable(async request=>{
 const {org,user,member}=await authorize(request,'hr');
 if(member.role!=='owner')throw new HttpsError('permission-denied','HR owner required');
 const employeeId=identifier(request.data.employeeId),year=String(request.data.year);
 if(!/^\d{4}$/.test(year)||+year<2001)throw new Error('Invalid carryover year');
 const priorRef=org.collection('hrLeaveBalances').doc(employeeId+'_'+(+year-1));
 const nextRef=org.collection('hrLeaveBalances').doc(employeeId+'_'+year);
 const eventRef=org.collection('hrLeaveLedgerEvents').doc(employeeId+'_'+year+'_carryover');
 return db.runTransaction(async tx=>{
  const [employee,policy,prior,next,event]=await Promise.all([
   tx.get(org.collection('employees').doc(employeeId)),
   tx.get(org.collection('hrSettings').doc('accrualPolicy')),tx.get(priorRef),tx.get(nextRef),tx.get(eventRef)]);
  if(!employee.exists||!policy.exists||!prior.exists||!next.exists)throw new Error('Employee, policy or both entitlement years unavailable');
  if(event.exists)return {employeeId,year,replayed:true,days:event.data().days};
  const result=carryForwardLeave(prior.data(),next.data(),policy.data());
  tx.update(nextRef,{grantedDays:result.grantedDays,updatedAt:stamp()});
  tx.create(eventRef,{employeeId,year,action:'carryover',days:result.days,actor:user,at:stamp()});
  return {employeeId,year,replayed:false,days:result.days};
 });
});

export const getHrAnnualLeaveBalance = callable(async request=>{
 const {org,user,member}=await authorize(request,'hr');
 const employeeId=identifier(request.data.employeeId),year=String(request.data.year);
 if(!/^\\d{4}$/.test(year))throw new Error('Invalid leave year');
 const employee=await org.collection('employees').doc(employeeId).get();
 if(!employee.exists||(member.role!=='owner'&&employee.data().portalUid!==user))
  throw new HttpsError('permission-denied','Employee balance unavailable');
 const balance=await org.collection('hrLeaveBalances').doc(employeeId+'_'+year).get();
 if(!balance.exists)return {employeeId,year,configured:false};
 return {employeeId,year,configured:true,grantedDays:balance.data().grantedDays,
  usedDays:balance.data().usedDays,remainingDays:validateLeaveLedger(balance.data())};
});
export const assignHrLeaveManager = callable(async request=>{
 const {org,user,member}=await authorize(request,'hr');
 if(member.role!=='owner')throw new HttpsError('permission-denied','HR owner required');
 const config=validateLeaveManagerAssignment(request.data);
 const target=await org.collection('members').doc(config.managerUid).get();
 if(!target.exists)throw new Error('Manager must be an organization member');
 await org.collection('hrLeaveManagers').doc(config.managerUid).set({...config,assignedBy:user,updatedAt:stamp()});
 return {managerUid:config.managerUid,active:config.active,departments:config.departments};
});
export const decideHrLeave = callable(async request=>{
 const {org,user,member}=await authorize(request,'hr');
 const id=identifier(request.data.requestId),ref=org.collection('hrLeaveRequests').doc(id);
 return db.runTransaction(async tx=>{
  const previous=await tx.get(ref);
  if(!previous.exists)throw new Error('Leave request unavailable');
  const employeeRef=org.collection('employees').doc(identifier(previous.data().employeeId));
  const [employee,assignment]=await Promise.all([tx.get(employeeRef),tx.get(org.collection('hrLeaveManagers').doc(user))]);
  if(!employee.exists)throw new Error('Employee unavailable');
  try{authorizeLeaveApprover({member,assignment:assignment.data(),employee:employee.data(),approverUid:user});}
  catch{throw new HttpsError('permission-denied','Not authorized to approve this employee leave');}
  const stage=leaveApprovalTransition(previous.data(),request.data.status,member.role==='owner'?'owner':'manager');
  const decision=stage.status==='manager_approved' ? {status:'manager_approved',decisionReason:null} : leaveDecision({...previous.data(),status:'requested'},stage.status,request.data.reason);
  let policyDays=null;
  if(stage.final&&previous.data().leaveType==='annual'){
   const employeeId=identifier(previous.data().employeeId);
   const year=leaveYear(previous.data().startDate);
   if(leaveYear(previous.data().endDate)!==year)
    throw new Error('Split cross-year leave into separate requests');
   const balanceRef=org.collection('hrLeaveBalances').doc(employeeId+'_'+year);
   const [settings,balance]=await Promise.all([
    tx.get(org.collection('hrSettings').doc('leavePolicy')),tx.get(balanceRef)]);
   if(!settings.exists||!balance.exists)throw new Error('Leave policy and annual entitlement must be configured');
   const policy=validateLeavePolicy(settings.data());
   policyDays=chargeableLeaveDays(previous.data(),policy);
   if(policyDays<1)throw new Error('Annual leave must include chargeable working days');
   const nextBalance=consumeLeave(balance.data(),policyDays);
   tx.update(balanceRef,{usedDays:nextBalance.usedDays,updatedAt:stamp()});
   tx.create(org.collection('hrLeaveLedgerEvents').doc('leave_'+id),{
    employeeId,year,requestId:id,action:'consume',days:policyDays,actor:user,at:stamp()});
  }
  tx.update(ref,{...decision,...(policyDays===null?{}:{approvedWorkingDays:policyDays}),decidedBy:user,decidedAt:stamp(),approvalStage:stage.final?'final':stage.status==='manager_approved'?'hr_review':'closed'});
  tx.create(ref.collection('audit').doc(randomUUID()),{
   from:previous.data().status,to:decision.status,actor:user,at:stamp(),
   decisionReason:decision.decisionReason});
  return {requestId:id,status:decision.status};
 });
});
export const listHrLeaveApprovalInbox = callable(async request=>{
 const {org,user,member}=await authorize(request,'hr');
 const owner=member.role==='owner';
 const assignment=owner?null:(await org.collection('hrLeaveManagers').doc(user).get()).data();
 if(!owner&&(!assignment?.active||assignment.role!=='leave_manager'||assignment.managerUid!==user))
  throw new HttpsError('permission-denied','Active leave manager required');
 const pending=await org.collection('hrLeaveRequests').where('status','in',owner?['requested','manager_approved']:['requested']).limit(201).get();
 if(pending.size>200)throw new Error('Pending inbox exceeds reporting limit');
 const employeeIds=[...new Set(pending.docs.map(d=>identifier(d.data().employeeId)))];
 const employees=await Promise.all(employeeIds.map(id=>org.collection('employees').doc(id).get()));
 const byId=new Map(employees.map(doc=>[doc.id,doc.data()]));
 const requests=pending.docs.filter(doc=>{
  const employee=byId.get(doc.data().employeeId);
  if(!employee)return false;
  if(!owner&&doc.data().status!=='requested')return false;
  try{authorizeLeaveApprover({member,assignment,employee,approverUid:user});return true;}
  catch{return false;}
 }).map(doc=>({id:doc.id,employeeId:doc.data().employeeId,
  employeeName:byId.get(doc.data().employeeId)?.name||'Employee',
  department:byId.get(doc.data().employeeId)?.department||'',
  leaveType:doc.data().leaveType,startDate:doc.data().startDate,
  endDate:doc.data().endDate,calendarDays:doc.data().calendarDays,
  status:doc.data().status}));
 return {requests,limit:200,complete:true};
});

export const listHrLeaveRequests = callable(async request=>{
 const {org,user,member}=await authorize(request,'hr');
 const employeeId=identifier(request.data.employeeId);
 const employee=await org.collection('employees').doc(employeeId).get();
 if(!employee.exists)throw new Error('Employee not found');
 if(member.role!=='owner'&&employee.data().portalUid!==user)
  throw new HttpsError('permission-denied','Employee identity not linked');
 const result=await org.collection('hrLeaveRequests').where('employeeId','==',employeeId).limit(100).get();
 return {requests:result.docs.map(d=>({id:d.id,startDate:d.data().startDate,endDate:d.data().endDate,
  leaveType:d.data().leaveType,status:d.data().status,calendarDays:d.data().calendarDays}))};
});

export const createPropertyLease = callable(async request=>{
 const {org,user,member}=await authorize(request,'property');
 if(member.role!=='owner')throw new HttpsError('permission-denied','Property owner required');
 const leaseId=identifier(request.data.leaseId||randomUUID());
 const lease=validateLease(request.data),unit=org.collection('properties').doc(lease.propertyId);
 const tenant=org.collection('contacts').doc(lease.tenantId);
 const ref=org.collection('propertyLeases').doc(leaseId);
 return db.runTransaction(async tx=>{
  const [property,contact,existing,other]=await Promise.all([
   tx.get(unit),tx.get(tenant),tx.get(ref),
   tx.get(org.collection('propertyLeases').where('propertyId','==',lease.propertyId).limit(501))]);
  if(!property.exists||!contact.exists)throw new Error('Property or tenant missing');
  if(existing.exists)throw new Error('Lease ID already exists');
  if(other.size>500)throw new Error('Lease history exceeds safe overlap scan');
  if(leaseOverlaps(lease,other.docs.map(d=>d.data())))
    throw new Error('Unit already leased for these dates');
  // Serialize concurrent lease creation for the same unit through a shared
  // property-document write, so competing transactions retry their overlap scan.
  tx.update(unit,{leaseRevision:FieldValue.increment(1),leaseUpdatedAt:stamp()});
  tx.create(ref,{...lease,leaseId,createdBy:user,createdAt:stamp()});
  return {leaseId,status:'active'};
 });
});
export const changePropertyLease = callable(async request=>{
 const {org,user,member}=await authorize(request,'property');
 if(member.role!=='owner')throw new HttpsError('permission-denied','Property owner required');
 const leaseId=identifier(request.data.leaseId),action=request.data.action;
 if(!['renew','terminate'].includes(action))throw new Error('Invalid lease action');
 const leaseRef=org.collection('propertyLeases').doc(leaseId);
 return db.runTransaction(async tx=>{
  const snapshot=await tx.get(leaseRef);
  if(!snapshot.exists)throw new Error('Lease not found');
  const before=snapshot.data();
  const unit=org.collection('properties').doc(identifier(before.propertyId));
  const [unitSnap,leases]=await Promise.all([tx.get(unit),
   tx.get(org.collection('propertyLeases').where('propertyId','==',before.propertyId).limit(501))]);
  if(!unitSnap.exists||leases.size>500)throw new Error('Cannot safely verify property lease history');
  let changes;
  if(action==='renew'){
   changes=renewLease(before,request.data);
   const competing=leases.docs.filter(d=>d.id!==leaseId).map(d=>d.data());
   if(leaseOverlaps({...before,...changes},competing))
    throw new Error('Renewal overlaps another active lease');
  }else{
   changes=terminateLease(before,request.data);
   // Existing charges are not deleted or reversed by an early termination.
  }
  const eventRef=leaseRef.collection('history').doc(randomUUID());
  tx.update(unit,{leaseRevision:FieldValue.increment(1),leaseUpdatedAt:stamp()});
  tx.update(leaseRef,{...changes,updatedAt:stamp(),updatedBy:user});
  tx.create(eventRef,{action,actor:user,at:stamp(),
   previousEndDate:before.endDate,newEndDate:changes.endDate,
   previousMonthlyRentMinor:before.monthlyRentMinor,
   newMonthlyRentMinor:changes.monthlyRentMinor??before.monthlyRentMinor,
   reason:changes.terminationReason??null});
  return {leaseId,action,status:changes.status??before.status,endDate:changes.endDate};
 });
});

export const issuePropertyRentCharge = callable(async request=>{
 const {org,user,member}=await authorize(request,'property');
 if(member.role!=='owner')throw new HttpsError('permission-denied','Property owner required');
 const leaseId=identifier(request.data.leaseId);
 const period=request.data.period;
 const leaseRef=org.collection('propertyLeases').doc(leaseId);
 const chargeRef=org.collection('propertyRentCharges').doc(leaseId+'_'+String(period));
 return db.runTransaction(async tx=>{
  const [leaseSnap,prior]=await Promise.all([tx.get(leaseRef),tx.get(chargeRef)]);
  if(!leaseSnap.exists)throw new Error('Lease not found');
  const charge=rentCharge(leaseSnap.data(),period);
  if(prior.exists){
   if(prior.data().amountMinor!==charge.amountMinor||
      prior.data().tenantId!==charge.tenantId)throw new Error('Rent charge conflicts with lease');
   return {chargeId:chargeRef.id,amountMinor:prior.data().amountMinor,replayed:true};
  }
  tx.create(chargeRef,{...charge,status:'issued',issuedBy:user,issuedAt:stamp()});
  return {chargeId:chargeRef.id,amountMinor:charge.amountMinor,replayed:false};
 });
});

// Payment evidence is created by a separate trusted settlement integration.
// This API cannot create or mark payment evidence as verified.
export const allocateVerifiedPropertyRent = callable(async request=>{
 const {org,user,member}=await authorize(request,'property');
 if(member.role!=='owner')throw new HttpsError('permission-denied','Property owner required');
 const paymentId=identifier(request.data.paymentId),chargeId=identifier(request.data.chargeId);
 const allocationId=identifier(request.data.allocationId);
 const amountMinor=money(request.data.amountMinor);
 const paymentRef=org.collection('verifiedRentPayments').doc(paymentId);
 const chargeRef=org.collection('propertyRentCharges').doc(chargeId);
 const allocationRef=org.collection('propertyRentAllocations').doc(allocationId);
 return db.runTransaction(async tx=>{
  const [payment,charge,prior,allocations]=await Promise.all([
   tx.get(paymentRef),tx.get(chargeRef),tx.get(allocationRef),
   tx.get(org.collection('propertyRentAllocations').where('paymentId','==',paymentId).limit(501))
  ]);
  if(!payment.exists||!charge.exists)throw new Error('Payment evidence or rent charge not found');
  if(prior.exists){
   const old=prior.data();
   if(old.paymentId!==paymentId||old.chargeId!==chargeId||old.amountMinor!==amountMinor)
    throw new Error('Conflicting allocation ID');
   return {allocationId,replayed:true};
  }
  if(allocations.size>500)throw new Error('Payment allocation history too large');
  if(payment.data().tenantId!==charge.data().tenantId)
   throw new Error('Payment and charge belong to different tenants');
  availableRentAllocation(payment.data(),allocations.docs.map(d=>d.data()),amountMinor);
  // Contention on the common payment and charge documents serializes competing allocations.
  const chargeAllocations=await tx.get(org.collection('propertyRentAllocations')
   .where('chargeId','==',chargeId).limit(501));
  if(chargeAllocations.size>500)throw new Error('Rent charge allocation history too large');
  const already=chargeAllocations.docs.reduce((sum,d)=>sum+d.data().amountMinor,0);
  if(!Number.isSafeInteger(already+amountMinor)||already+amountMinor>charge.data().amountMinor)
   throw new Error('Allocation exceeds charge outstanding');
  tx.update(paymentRef,{allocationRevision:FieldValue.increment(1)});
  tx.update(chargeRef,{allocationRevision:FieldValue.increment(1)});
  tx.create(allocationRef,{paymentId,chargeId,leaseId:charge.data().leaseId,
   tenantId:charge.data().tenantId,amountMinor,verified:true,createdBy:user,createdAt:stamp()});
  return {allocationId,replayed:false};
 });
});

export const getPropertyTenantStatement = callable(async request=>{
 const {org,member}=await authorize(request,'property');
 if(member.role!=='owner')throw new HttpsError('permission-denied','Property owner required');
 const leaseId=identifier(request.data.leaseId);
 const asOf=request.data.asOf;
 const lease=await org.collection('propertyLeases').doc(leaseId).get();
 if(!lease.exists)throw new Error('Lease not found');
 const charges=await org.collection('propertyRentCharges').where('leaseId','==',leaseId).limit(501).get();
 if(charges.size>500)throw new Error('Charge history exceeds bounded report');
 const allocations=await org.collection('propertyRentAllocations').where('leaseId','==',leaseId).limit(1001).get();
 if(allocations.size>1000)throw new Error('Allocation history exceeds bounded report');
 const statement=propertyTenantStatement(
   charges.docs.map(d=>({chargeId:d.id,...d.data()})),
   allocations.docs.map(d=>({allocationId:d.id,...d.data()})),{asOf});
 return {leaseId,tenantId:lease.data().tenantId,...statement,
  reconciliationStatus:'allocation_records_only',
  limitations:'Amounts rely on trusted externally verified rent-payment evidence; this endpoint does not independently confirm bank settlements.'};
});

export const createPropertyMaintenanceTicket = callable(async request=>{
 const {org,user}=await authorize(request,'property');
 const id=identifier(request.data.ticketId||randomUUID());
 const ticket=maintenanceTicket(request.data);
 const property=org.collection('properties').doc(ticket.propertyId);
 const ref=org.collection('propertyMaintenance').doc(id);
 await db.runTransaction(async tx=>{
  if(!(await tx.get(property)).exists)throw new Error('Property not found in workspace');
  tx.create(ref,{...ticket,createdBy:user,createdAt:stamp(),updatedAt:stamp()});
  tx.create(ref.collection('history').doc(randomUUID()),
   {action:'created',to:'open',actor:user,at:stamp()});
 });
 return {ticketId:id,status:'open'};
});
export const updatePropertyMaintenanceTicket = callable(async request=>{
 const {org,user,member}=await authorize(request,'property');
 const id=identifier(request.data.ticketId);
 const ref=org.collection('propertyMaintenance').doc(id);
 const next=request.data.status;
 return db.runTransaction(async tx=>{
  const prior=await tx.get(ref);
  if(!prior.exists)throw new Error('Maintenance ticket not found');
  // Only the creator may cancel their unassigned ticket; all other
  // lifecycle transitions are property-manager (workspace owner) actions.
  if(member.role!=='owner'&&!(next==='cancelled'&&prior.data().status==='open'&&prior.data().createdBy===user))
   throw new HttpsError('permission-denied','Property manager approval required');
  const transition=transitionMaintenance(prior.data(),next,{
   note:request.data.note??'',assigneeId:request.data.assigneeId??null});
  tx.update(ref,{status:transition.status,assigneeId:transition.assigneeId,updatedAt:stamp(),updatedBy:user,
   ...(next==='resolved'?{resolutionNote:transition.note,resolvedAt:stamp()}:{})});
  tx.create(ref.collection('history').doc(randomUUID()),{
   from:prior.data().status,to:next,actor:user,note:transition.note,at:stamp()});
  return {ticketId:id,status:next};
 });
});
export const listPropertyMaintenanceTickets = callable(async request=>{
 const {org}=await authorize(request,'property');
 const propertyId=identifier(request.data.propertyId);
 const limit=request.data.limit??50;
 if(!Number.isInteger(limit)||limit<1||limit>100)throw new Error('Invalid page size');
 const [property,tickets]=await Promise.all([
  org.collection('properties').doc(propertyId).get(),
  org.collection('propertyMaintenance').where('propertyId','==',propertyId).limit(limit).get()
 ]);
 if(!property.exists)throw new Error('Property not found');
 return {tickets:tickets.docs.map(doc=>({
  id:doc.id,propertyId,status:doc.data().status,priority:doc.data().priority,
  title:doc.data().title,assigneeId:doc.data().assigneeId??null
 }))};
});

export const createPosCartSale = callable(async request=>{
 const {org,user}=await authorize(request,'pos');
 const id=identifier(request.data.requestId),contactId=identifier(request.data.contactId);
 const items=validatePosCart(request.data.items);
 const saleRef=org.collection('sales').doc(id);
 const contactRef=org.collection('contacts').doc(contactId);
 const productRefs=items.map(item=>org.collection('products').doc(item.productId));
 return db.runTransaction(async tx=>{
  // Every read precedes all writes, including the FEFO batch queries.
  const [previous,customer,...products]=await Promise.all([
   tx.get(saleRef),tx.get(contactRef),...productRefs.map(ref=>tx.get(ref))]);
  if(previous.exists){
   const prior=previous.data();
   if(prior.kind!=='pos_cart'||prior.contactId!==contactId||
      JSON.stringify(prior.cartRequest)!==JSON.stringify(items))
    throw new Error('Sale request ID already used for different cart');
   return {id,total:prior.total,replayed:true};
  }
  if(!customer.exists||products.some(p=>!p.exists))throw new Error('Customer or product unavailable');
  const productsById=new Map(products.map(p=>[p.id,p.data()]));
  const priced=pricePosCart(items,productsById);
  const warehouseIds=items.map(item=>identifier(productsById.get(item.productId).warehouseId||'main'));
  const warehouseRefs=items.map((item,i)=>org.collection('warehouseStock').doc(warehouseIds[i]+'__'+item.productId));
  const [warehouses,...batchQueries]=await Promise.all([
    Promise.all(warehouseRefs.map(ref=>tx.get(ref))),
    ...items.map((item,i)=>tx.get(org.collection('inventoryBatches')
      .where('warehouseId','==',warehouseIds[i]).where('sku','==',item.productId)))
  ]);
  const {allocateBatchesFEFO}=await import('./inventory_batches_domain.js');
  const updates=[];
  const lineSnapshots=priced.lines.map((line,i)=>{
    const available=warehouses[i].data()?.quantity;
    if(!Number.isSafeInteger(available)||available<line.quantity)
      throw new Error('Insufficient warehouse stock for '+line.productId);
    const batchSnap=batchQueries[i];
    let allocations=[];
    if(!batchSnap.empty){
      allocations=allocateBatchesFEFO({quantity:line.quantity,
        batches:batchSnap.docs.map(d=>({batchId:d.data().batchId,
          quantity:d.data().quantity,expiryAt:d.data().expiryAt||null}))}).allocations;
      for(const allocation of allocations){
        const lot=batchSnap.docs.find(d=>d.data().batchId===allocation.batchId);
        updates.push({ref:lot.ref,quantity:lot.data().quantity-allocation.quantity});
      }
    }
    updates.push({ref:warehouseRefs[i],quantity:available-line.quantity});
    updates.push({ref:productRefs[i],stock:productsById.get(line.productId).stock-line.quantity});
    return {...line,warehouseId:warehouseIds[i],batchAllocations:allocations};
  });
  for(const update of updates)tx.update(update.ref,{
    ...(update.quantity!==undefined?{quantity:update.quantity}:{stock:update.stock}),updatedAt:stamp()});
  tx.create(saleRef,{kind:'pos_cart',contactId,cartRequest:items,lines:lineSnapshots,
    total:priced.total,currency:'KES',paymentState:'unpaid',
    createdAt:stamp(),createdBy:user});
  tx.create(org.collection('events').doc('sale_'+id),{type:'sale.created',saleId:id,createdAt:stamp()});
  return {id,total:priced.total,replayed:false,items:lineSnapshots.length};
 });
});

export const getPosReceipt = callable(async request=>{
 const {org}=await authorize(request,'pos');
 const saleId=identifier(request.data.saleId);
 const sale=await org.collection('sales').doc(saleId).get();
 if(!sale.exists)throw new HttpsError('not-found','Sale not found');
 return posReceipt(sale.data(),saleId);
});

export const saleAutomation = onDocumentCreated({document: 'organizations/{orgId}/events/{eventId}', region, retry: true}, async event => {
  if (event.data?.data().type !== 'sale.created') return;
  const org = root(event.params.orgId);
  const saleId = identifier(event.data.data().saleId);
  await db.runTransaction(async tx => {
    const runRef = org.collection('automationRuns').doc(event.params.eventId);
    const postingDate = new Date().toISOString().slice(0,10);
    const period = accountingPeriod(postingDate);
    const [run, saleSnap, books, crm, periodLock, existingInvoice, existingJournal, existingTax] = await Promise.all([
      tx.get(runRef),
      tx.get(org.collection('sales').doc(saleId)),
      tx.get(org.collection('apps').doc('accounting')),
      tx.get(org.collection('apps').doc('crm')),
      tx.get(org.collection('accountingPeriods').doc(period)),
      tx.get(org.collection('invoices').doc(saleId)),
      tx.get(org.collection('journals').doc(`invoice_${saleId}`)),
      tx.get(org.collection('taxOutbox').doc(saleId))
    ]);
    const accountingActive=books.data()?.expiresAt?.toMillis()>Date.now();
    const decision=saleInvoicePostingDecision({
      runExists:run.exists,sale:saleSnap.exists?saleSnap.data():null,
      accountingActive,periodClosed:periodLock.data()?.status==='closed',
      invoiceExists:existingInvoice.exists,journalExists:existingJournal.exists,
      taxOutboxExists:existingTax.exists});
    if(decision.action==='already_processed'||decision.action==='missing_sale')return;
    if(decision.action.startsWith('blocked_')){
      tx.create(runRef,{status:decision.action,saleId,period,blockedAt:stamp()});
      return;
    }
    const sale=saleSnap.data();
    if (books.data()?.expiresAt?.toMillis() > Date.now()) {
      assertOpenPeriod(period,periodLock.data());
      tx.create(org.collection('invoices').doc(saleId), {saleId, contactId: sale.contactId, total: sale.total, currency: sale.currency, paymentState: 'unpaid', status: 'draft', taxStatus: 'requires_tax_configuration', createdAt: stamp()});
      const posting = preparePosting({postingDate,periodState:periodLock.data(),sourceType:'sale',sourceId:saleId,journal:invoiceJournal(sale.total)});
      tx.create(org.collection('journals').doc(`invoice_${saleId}`), {...posting.journal,createdAt:stamp()});
      tx.create(org.collection('taxOutbox').doc(saleId), {invoiceId: saleId, status: 'blocked_configuration', provider: 'kra-etims', createdAt: stamp()});
    }
    if (crm.data()?.expiresAt?.toMillis() > Date.now()) tx.create(org.collection('tasks').doc(`followup_${saleId}`), {name: 'Follow up after sale', contactId: sale.contactId, saleId, status: 'open', createdAt: stamp()});
    tx.create(runRef, {status: 'completed', completedAt: stamp()});
  });
});

export const startSubscriptionPayment = callable(async request => {
  const {org, user} = await authorize(request, null, true);
  const pricing = quote(request.data.apps);
  const provider = request.data.provider;
  if (!['paystack', 'mpesa'].includes(provider)) throw new Error('Unknown payment provider');
  const reference = randomUUID();
  const payment = org.collection('payments').doc(reference);
  await payment.create({...pricing, provider, reference, user, state: 'initializing', createdAt: stamp()});
  await db.doc(`paymentReferences/${reference}`).create({orgId: org.id});
  try {
    if (provider === 'paystack') {
      const email = textValue(request.auth.token.email, 254);
      const result = await initializePaystack({secret: paystackSecret.value(), email, amount: pricing.total, reference});
      await payment.update({state: 'pending', authorizationUrl: result.authorization_url});
      return {reference, url: result.authorization_url};
    }
    const result = await initiateMpesa(JSON.parse(mpesaConfig.value()), {phone: textValue(request.data.phone), amount: pricing.total / 100, reference});
    await payment.update({state: 'pending_reconciliation', checkoutRequestId: result.CheckoutRequestID});
    return {reference, message: 'STK request sent. Complete payment on your phone, then select Check payment.'};
  } catch (error) {
    await payment.update({state: 'initialization_failed'});
    throw error;
  }
}, [paystackSecret, mpesaConfig]);

async function settleMpesa(org, reference, config) {
  const ref = org.collection('payments').doc(identifier(reference));
  const payment = (await ref.get()).data();
  if (!payment || payment.provider !== 'mpesa') throw new Error('M-Pesa payment not found');
  if (payment.state === 'paid') return {state: 'paid'};
  if (!payment.checkoutRequestId) throw new Error('Payment has not been initialized');
  const result = await queryMpesa(config, payment.checkoutRequestId);
  if (String(result.ResultCode) !== '0') return {state: 'pending_or_failed', message: 'No successful payment verified yet. Retry after completing the phone prompt.'};
  await db.runTransaction(async tx => {
    const fresh = await tx.get(ref);
    if (fresh.data()?.state === 'paid') return;
    const appRefs = payment.apps.map(id => org.collection('apps').doc(id));
    const installed = await Promise.all(appRefs.map(r => tx.get(r)));
    installed.forEach((snap, i) => {
      const start = snap.data()?.state === 'paid' ? Math.max(Date.now(), snap.data().expiresAt.toMillis()) : Date.now();
      tx.set(appRefs[i], {appId: payment.apps[i], state: 'paid', expiresAt: Timestamp.fromMillis(start + payment.periodDays * 86400000), shares: catalog[payment.apps[i]].shares}, {merge: true});
    });
    tx.update(ref, {state: 'paid', paidAt: stamp(), verification: 'daraja-stk-query'});
  });
  return {state: 'paid'};
}

export const checkMpesaPayment = callable(async request => {
  const {org} = await authorize(request, null, true);
  return settleMpesa(org, request.data.reference, JSON.parse(mpesaConfig.value()));
}, [mpesaConfig]);

export const mpesaCallback = onRequest({region}, (req, res) => {
  if (req.method !== 'POST') { res.sendStatus(405); return; }
  res.status(200).json({ResultCode: 0, ResultDesc: 'Accepted'});
});

export const paystackWebhook = onRequest({region, secrets: [paystackSecret]}, async (req, res) => {
  if (req.method !== 'POST') { res.sendStatus(405); return; }
  if (!verifyPaystack(req.rawBody, req.get('x-paystack-signature'), paystackSecret.value())) { res.sendStatus(401); return; }
  if (req.body?.event !== 'charge.success') { res.sendStatus(200); return; }
  try {
    const reference = identifier(req.body.data.reference);
    const mapping = (await db.doc(`paymentReferences/${reference}`).get()).data();
    if (!mapping) {
      const customerMapping=(await db.doc(`customerInvoicePaymentReferences/${reference}`).get()).data();
      if(customerMapping){
       const verified=await verifyTransaction(paystackSecret.value(),reference);
       const org=root(customerMapping.orgId),intentRef=org.collection('customerPaymentIntents').doc(reference);
       const settlementRef=org.collection('customerSettlements').doc(reference);
       await db.runTransaction(async tx=>{
        const [intent,settlement]=await Promise.all([tx.get(intentRef),tx.get(settlementRef)]);
        if(settlement.exists)return;
        if(!intent.exists)throw new Error('Payment intent missing');
        const evidence=verifiedCustomerPaystackSettlement(intent.data(),verified,reference);
        tx.create(settlementRef,{...evidence,allocatedMinor:0,availableMinor:evidence.amountMinor,
         verifiedAt:stamp()});
        tx.update(intentRef,{state:'verified',verifiedAt:stamp()});
       });
       res.sendStatus(200);return;
      }
      if ((await db.doc(`resellerPaymentReferences/${reference}`).get()).exists) {
        const {settleResellerPayment} = await import('./reseller.js');
        await settleResellerPayment(reference, await verifyTransaction(paystackSecret.value(), reference));
      }
      res.sendStatus(200); return;
    }
    const verified = await verifyTransaction(paystackSecret.value(), reference);
    const org = root(mapping.orgId);
    await db.runTransaction(async tx => {
      const paymentRef = org.collection('payments').doc(reference);
      const paymentSnap = await tx.get(paymentRef);
      const payment = paymentSnap.data();
      if (!payment || payment.state === 'paid') return;
      if (verified.status !== 'success' || verified.reference !== reference || verified.amount !== payment.total || verified.currency !== payment.currency || payment.provider !== 'paystack') throw new Error('Payment mismatch');
      const appRefs = payment.apps.map(app => org.collection('apps').doc(app));
      const apps = await Promise.all(appRefs.map(ref => tx.get(ref)));
      apps.forEach((snap, i) => {
        const start = snap.data()?.state === 'paid' ? Math.max(Date.now(), snap.data().expiresAt.toMillis()) : Date.now();
        tx.set(appRefs[i], {appId: payment.apps[i], state: 'paid', expiresAt: Timestamp.fromMillis(start + payment.periodDays * 86400000), shares: catalog[payment.apps[i]].shares}, {merge: true});
      });
      tx.update(paymentRef, {state: 'paid', paidAt: stamp(), providerTransactionId: String(verified.id)});
    });
    res.sendStatus(200);
  } catch { res.sendStatus(500); }
});

export const generateReport = callable(async request => {
  const {org} = await authorize(request, null, true);
  const [sales, products, contacts] = await Promise.all([
    org.collection('sales').limit(500).get(),
    org.collection('products').limit(500).get(),
    org.collection('contacts').count().get()
  ]);
  const facts = {
    currency: 'KES',
    salesCount: sales.size,
    salesValueMinor: sales.docs.reduce((n, d) => n + d.data().total, 0),
    lowStockProducts: products.docs.filter(d => d.data().stock < 5).length,
    contacts: contacts.data().count,
    boundedToFirst500: true,
    cashCollected: 'not calculated; sales include unpaid orders'
  };
  let narrative = `${facts.salesCount} sales recorded for KES ${(facts.salesValueMinor / 100).toFixed(2)}. ${facts.lowStockProducts} products have fewer than five units. Sales totals are not collected revenue.`;
  let mode = 'deterministic';
  if (request.data.useAi === true) {
    const key = geminiKey.value();
    const model = process.env.GEMINI_MODEL;
    if (!key || !model) throw new Error('Configure GEMINI_API_KEY and GEMINI_MODEL before AI reporting');
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json', 'x-goog-api-key': key},
      signal: AbortSignal.timeout(30000),
      body: JSON.stringify({contents: [{parts: [{text: `Write a short business operations report using only these JSON facts. Currency amounts are minor units. Do not invent trends, comparisons, tax advice or forecasts. Mention the 500-record limit and unpaid sales. Suggest 2 operational actions. Facts: ${JSON.stringify(facts)}`}]}]})
    });
    if (!response.ok) throw new Error('AI provider unavailable');
    const result = await response.json();
    narrative = result.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('') || '';
    if (!narrative) throw new Error('AI provider returned no report');
    mode = 'ai';
  }
  const report = {facts, narrative, mode};
  await org.collection('reports').add({...report, createdAt: stamp()});
  return report;
}, [geminiKey]);
