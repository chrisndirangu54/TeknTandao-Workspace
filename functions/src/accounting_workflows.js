import {getFirestore, FieldValue} from 'firebase-admin/firestore';
import {onCall, HttpsError} from 'firebase-functions/v2/https';
import {randomUUID} from 'node:crypto';
import {identifier, canAccess} from './domain.js';
import {buildReversal, buildCredit, planNetting, applyNetting} from './accounting_domain.js';
import {creditJournal, trialBalance} from './ledger_domain.js';

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
  await db.runTransaction(async tx => {
    const [invoiceSnap, existing] = await Promise.all([tx.get(invoiceRef), tx.get(reversalRef)]);
    if (existing.exists) {
      if (existing.data().reverses !== invoiceRef.id) throw new Error('Request ID already used');
      return;
    }
    const invoice = invoiceSnap.data();
    if (!invoice) throw new Error('Invoice unavailable');
    const reversal = buildReversal({...invoice, id: invoiceRef.id}, reversalRef.id);
    tx.create(reversalRef, {...reversal, createdAt: stamp(), createdBy: user});
    tx.update(invoiceRef, {paymentState: 'reversed', reversedBy: reversalRef.id, updatedAt: stamp()});
    tx.create(org.collection('journals').doc(`reversal_${reversalRef.id}`), {...creditJournal(reversal.total), source: 'reversal', sourceId: reversalRef.id, memo: `Reversal of ${invoiceRef.id}`, createdAt: stamp()});
  });
  return {id: reversalRef.id};
});

export const issueCreditNote = api(async request => {
  const {db, org, user} = await books(request);
  const credit = buildCredit(request.data);
  const ref = org.collection('invoices').doc(identifier(request.data.requestId || randomUUID()));
  await db.runTransaction(async tx => {
    const existing = await tx.get(ref);
    if (existing.exists) {
      const data = existing.data();
      if (data.kind !== 'reversal' || data.paymentState !== 'reversal' || data.name !== credit.name || data.total !== credit.total) throw new Error('Request ID already used');
      return;
    }
    await partyExists(tx, org, credit);
    tx.create(ref, {...credit, createdAt: stamp(), createdBy: user});
    tx.create(org.collection('journals').doc(`credit_${ref.id}`), {...creditJournal(credit.total), source: 'credit', sourceId: ref.id, createdAt: stamp()});
  });
  return {id: ref.id};
});

export const getTrialBalance = api(async request => {
  const {org} = await books(request);
  const page = await org.collection('journals').orderBy('createdAt', 'desc').limit(500).get();
  return {...trialBalance(page.docs.map(doc => doc.data())), truncated: page.size === 500};
});

export const netInvoices = api(async request => {
  const {db, org, user} = await books(request);
  const leftRef = org.collection('invoices').doc(identifier(request.data.leftId));
  const rightRef = org.collection('invoices').doc(identifier(request.data.rightId));
  const nettingRef = org.collection('accountingNettings').doc(identifier(request.data.requestId));
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
