import {getFirestore, FieldValue} from 'firebase-admin/firestore';
import {onCall, HttpsError} from 'firebase-functions/v2/https';
import {randomUUID} from 'node:crypto';
import {identifier, canAccess} from './domain.js';
import {buildReversal, buildCredit, planNetting, applyNetting} from './accounting_domain.js';
import {creditJournal, trialBalance} from './ledger_domain.js';
import {accountingPeriod, assertOpenPeriod} from './accounting_period_domain.js';
import {preparePosting} from './posting_policy_domain.js';
import {provisionalFinancialStatements} from './financial_statements_domain.js';
import {provisionalCashFlow} from './cash_flow_domain.js';
import {depreciationSchedule,depreciationJournal,planAssetDisposal,assetAcquisitionJournal} from './fixed_assets_domain.js';

const region = 'europe-west1';
const stamp = () => FieldValue.serverTimestamp();
function api(handler) {
  return onCall({region}, async request => {
    try { return await handler(request); }
    catch (error) {
      if (error instanceof HttpsError) throw error;
      throw new HttpsError('failed-precondition', error.message || 'Request failed');
    }
  });
}
async function books(request) {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in first');
  const db = getFirestore();
  const org = db.doc(`organizations/${identifier(request.data.orgId)}`);
  const [installation, member] = await Promise.all([
    org.collection('apps').doc('accounting').get(), org.collection('members').doc(request.auth.uid).get(),
  ]);
  if (!canAccess(member.data(), 'accounting', installation.data())) throw new HttpsError('permission-denied', 'Accounting access required');
  return {db, org, user: request.auth.uid};
}
async function partyExists(tx, org, credit) {
  const ref = credit.contactId ? org.collection('contacts').doc(credit.contactId) : org.collection('patients').doc(credit.patientId);
  if (!(await tx.get(ref)).exists) throw new Error('Select an existing customer or patient');
}

export const reverseInvoice = api(async request => {
  const {db, org, user} = await books(request);
  const invoiceRef = org.collection('invoices').doc(identifier(request.data.invoiceId));
  const reversalRef = org.collection('invoices').doc(identifier(request.data.requestId));
  if (invoiceRef.id === reversalRef.id) throw new Error('Reversal must have a different ID from its source invoice');
  const postingDate = request.data.postingDate;
  const period = accountingPeriod(postingDate);
  await db.runTransaction(async tx => {
    const [invoiceSnap, existing, lock] = await Promise.all([tx.get(invoiceRef), tx.get(reversalRef), tx.get(org.collection('accountingPeriods').doc(period))]);
    if (existing.exists) {
      if (existing.data().reverses !== invoiceRef.id) throw new Error('Request ID already used');
      return;
    }
    assertOpenPeriod(period, lock.data());
    const invoice = invoiceSnap.data();
    if (!invoice) throw new Error('Invoice unavailable');
    const reversal = buildReversal({...invoice, id: invoiceRef.id}, reversalRef.id);
    tx.create(reversalRef, {...reversal, createdAt: stamp(), createdBy: user});
    tx.update(invoiceRef, {paymentState: 'reversed', reversedBy: reversalRef.id, updatedAt: stamp()});
    const posting = preparePosting({postingDate, periodState:lock.data(), sourceType:'reversal', sourceId:reversalRef.id, journal:creditJournal(reversal.total)});
    tx.create(org.collection('journals').doc(`reversal_${reversalRef.id}`), {...posting.journal, memo:`Reversal of ${invoiceRef.id}`, createdAt:stamp()});
  });
  return {id: reversalRef.id};
});

export const issueCreditNote = api(async request => {
  const {db, org, user} = await books(request);
  const credit = buildCredit(request.data);
  const ref = org.collection('invoices').doc(identifier(request.data.requestId || randomUUID()));
  const postingDate = request.data.postingDate;
  const period = accountingPeriod(postingDate);
  await db.runTransaction(async tx => {
    const [existing, lock] = await Promise.all([tx.get(ref), tx.get(org.collection('accountingPeriods').doc(period))]);
    if (existing.exists) {
      const data = existing.data();
      if (data.kind !== 'reversal' || data.paymentState !== 'reversal' || data.name !== credit.name ||
          data.total !== credit.total || data.currency !== credit.currency ||
          data.contactId !== credit.contactId || data.patientId !== credit.patientId) {
        throw new Error('Request ID already used');
      }
      return;
    }
    assertOpenPeriod(period, lock.data());
    await partyExists(tx, org, credit);
    tx.create(ref, {...credit, createdAt: stamp(), createdBy: user});
    const posting = preparePosting({postingDate, periodState:lock.data(), sourceType:'credit', sourceId:ref.id, journal:creditJournal(credit.total)});
    tx.create(org.collection('journals').doc(`credit_${ref.id}`), {...posting.journal, createdAt:stamp()});
  });
  return {id: ref.id};
});

export const getTrialBalance = api(async request => {
  const {org} = await books(request);
  // Never return a partial trial balance as though it represented full books.
  // Fetch one extra record to detect the hard reporting limit explicitly.
  const page = await org.collection('journals').orderBy('createdAt', 'desc').limit(501).get();
  if (page.size > 500) {
    throw new HttpsError('resource-exhausted',
      'Trial balance exceeds the 500-journal reporting limit. Export or paginate the complete ledger before closing accounts.');
  }
  return {...trialBalance(page.docs.map(doc => doc.data())), truncated: false};
});

export const getProvisionalFinancialStatements = api(async request => {
  const {org}=await books(request);
  const snapshot=await org.collection('journals').limit(501).get();
  if(snapshot.size>500)throw new HttpsError('resource-exhausted','Full financial statements require paginated journal reporting above 500 entries');
  return provisionalFinancialStatements(snapshot.docs.map(doc=>doc.data()));
});

export const getProvisionalCashFlow = api(async request => {
  const {org}=await books(request);
  const snapshot=await org.collection('journals').limit(501).get();
  if(snapshot.size>500)throw new HttpsError('resource-exhausted','Cash flow reporting needs pagination beyond 500 journals');
  return provisionalCashFlow(snapshot.docs.map(doc=>doc.data()));
});

// Owner-scoped fixed asset registration; asset acquisition accounting remains separate.
export const registerFixedAsset = api(async request => {
  const {db,org,user}=await books(request);
  const membership=await org.collection('members').doc(user).get();
  if(membership.data()?.role!=='owner')throw new HttpsError('permission-denied','Owner required');
  const id=identifier(request.data.assetId);
  const schedule=depreciationSchedule({...request.data,assetId:id});
  const ref=org.collection('fixedAssets').doc(id);
  await ref.create({assetId:id,costMinor:request.data.costMinor,residualMinor:request.data.residualMinor||0,
    lifeMonths:request.data.lifeMonths,startMonth:request.data.startMonth,schedule,
    createdBy:user,createdAt:stamp()});
  return {assetId:id,periodCount:schedule.length};
});
// Creates an acquisition asset and an unreconciled clearing liability.
// This does not claim that a supplier was paid or an invoice was verified.
export const postFixedAssetAcquisition = api(async request => {
  const {db,org,user}=await books(request);
  const membership=await org.collection('members').doc(user).get();
  if(membership.data()?.role!=='owner')throw new HttpsError('permission-denied','Owner required');
  const id=identifier(request.data.assetId);
  const postingDate=request.data.postingDate;
  const period=accountingPeriod(postingDate);
  const ref=org.collection('fixedAssets').doc(id);
  const journalRef=org.collection('journals').doc(`asset_acquisition_${id}`);
  return db.runTransaction(async tx=>{
    const [asset,existing,lock]=await Promise.all([tx.get(ref),tx.get(journalRef),
      tx.get(org.collection('accountingPeriods').doc(period))]);
    if(!asset.exists)throw new Error('Asset not registered');
    if(existing.exists){
      if(existing.data().postingDate!==postingDate||existing.data().total!==asset.data().costMinor)
        throw new Error('Conflicting asset acquisition posting');
      return {assetId:id,replayed:true};
    }
    if(asset.data().disposedAt||asset.data().status==='disposed')
      throw new Error('Cannot acquire a disposed asset');
    assertOpenPeriod(period,lock.data());
    const posting=preparePosting({postingDate,periodState:lock.data(),
      sourceType:'asset_acquisition',sourceId:id,
      journal:assetAcquisitionJournal(asset.data().costMinor)});
    tx.create(journalRef,{...posting.journal,createdBy:user,createdAt:stamp(),
      settlementState:'unreconciled'});
    tx.update(ref,{acquisitionJournalId:journalRef.id,acquisitionPostingDate:postingDate});
    return {assetId:id,posted:true,replayed:false,settlementState:'unreconciled'};
  });
});
export const postFixedAssetDepreciation = api(async request => {
  const {db,org,user}=await books(request);
  const membership=await org.collection('members').doc(user).get();
  if(membership.data()?.role!=='owner')throw new HttpsError('permission-denied','Owner required');
  const id=identifier(request.data.assetId),period=request.data.period;
  if(typeof period!=='string'||!/^\d{4}-(0[1-9]|1[0-2])$/.test(period))throw new Error('Invalid period');
  const ref=org.collection('fixedAssets').doc(id);
  const journalRef=org.collection('journals').doc(`depreciation_${id}_${period}`);
  return db.runTransaction(async tx=>{
    const [asset,existing,lock]=await Promise.all([tx.get(ref),tx.get(journalRef),
      tx.get(org.collection('accountingPeriods').doc(period))]);
    if(!asset.exists)throw new Error('Asset unavailable');
    if(existing.exists)return {assetId:id,period,replayed:true};
    if(asset.data().disposedAt || asset.data().status==='disposed')throw new Error('Cannot depreciate a disposed asset');
    assertOpenPeriod(period,lock.data());
    const entry=asset.data().schedule.find(row=>row.period===period);
    if(!entry)throw new Error('Period outside asset useful life');
    if(entry.expenseMinor===0)return {assetId:id,period,skippedZero:true};
    const posting=preparePosting({postingDate:period+'-01',periodState:lock.data(),
      sourceType:'depreciation',sourceId:id+'_'+period,journal:depreciationJournal(entry.expenseMinor)});
    tx.create(journalRef,{...posting.journal,createdBy:user,createdAt:stamp()});
    return {assetId:id,period,expenseMinor:entry.expenseMinor,replayed:false};
  });
});

// Preview only: disposal cannot be posted until acquisition and accumulated
// depreciation have been reconciled against the general ledger.
export const previewFixedAssetDisposal = api(async request => {
  const {org,user}=await books(request);
  const member=await org.collection('members').doc(user).get();
  if(member.data()?.role!=='owner')throw new HttpsError('permission-denied','Owner required');
  const id=identifier(request.data.assetId);
  const asset=await org.collection('fixedAssets').doc(id).get();
  if(!asset.exists)throw new Error('Asset unavailable');
  if(asset.data().disposedAt || asset.data().status==='disposed')throw new Error('Asset already disposed');
  const schedule=asset.data().schedule;
  if(!Array.isArray(schedule))throw new Error('Asset depreciation schedule unavailable');
  const journalRefs=schedule.filter(row=>row.expenseMinor>0).map(row=>
    org.collection('journals').doc(`depreciation_${id}_${row.period}`));
  if(journalRefs.length>500)throw new HttpsError('resource-exhausted','Depreciation reconciliation exceeds supported period count');
  const journals=await Promise.all(journalRefs.map(ref=>ref.get()));
  let accumulatedMinor=0;
  for(let i=0;i<journals.length;i++){
    const journal=journals[i];
    if(!journal.exists)continue;
    const data=journal.data();
    if(data.sourceType!=='depreciation'||data.sourceId!==id+'_'+schedule.filter(r=>r.expenseMinor>0)[i].period)
      throw new Error('Depreciation journal source mismatch');
    const amount=data.lines?.filter(line=>line.account==='1590').reduce((sum,line)=>sum+line.credit-line.debit,0);
    if(!Number.isSafeInteger(amount)||amount!==schedule.filter(r=>r.expenseMinor>0)[i].expenseMinor)
      throw new Error('Depreciation journal amount mismatch');
    accumulatedMinor+=amount;
  }
  const plan=planAssetDisposal({costMinor:asset.data().costMinor,
    accumulatedMinor,proceedsMinor:request.data.proceedsMinor||0});
  return {assetId:id,accumulatedMinor,...plan,previewOnly:true,
    warning:'Preview uses recorded depreciation journals but asset acquisition and disposal proceeds have not been independently verified. No disposal is posted.'};
});

export const netInvoices = api(async request => {
  const {db, org, user} = await books(request);
  const leftRef = org.collection('invoices').doc(identifier(request.data.leftId));
  const rightRef = org.collection('invoices').doc(identifier(request.data.rightId));
  const nettingRef = org.collection('accountingNettings').doc(identifier(request.data.requestId));
  if (leftRef.id === rightRef.id) throw new Error('Cannot net an invoice against itself');
  await db.runTransaction(async tx => {
    const [leftSnap, rightSnap, existing] = await Promise.all([tx.get(leftRef), tx.get(rightRef), tx.get(nettingRef)]);
    if (existing.exists) {
      const ids = existing.data().invoiceIds || [];
      if (!ids.includes(leftRef.id) || !ids.includes(rightRef.id)) throw new Error('Request ID already used');
      return;
    }
    const left = leftSnap.data();
    const right = rightSnap.data();
    if (!left || !right) throw new Error('Invoice unavailable');
    const plan = planNetting({...left, id: leftRef.id}, {...right, id: rightRef.id});
    for (const allocation of plan.allocations) {
      const ref = allocation.id === leftRef.id ? leftRef : rightRef;
      const source = allocation.id === leftRef.id ? left : right;
      tx.update(ref, {...applyNetting(source, allocation.apply), updatedAt: stamp()});
    }
    tx.create(nettingRef, {amount: plan.amount, currency: plan.currency, invoiceIds: [leftRef.id, rightRef.id].sort(), createdAt: stamp(), createdBy: user});
  });
  return {id: nettingRef.id};
});
