import './index.js';
import {getFirestore, FieldValue} from 'firebase-admin/firestore';
import {onRequest} from 'firebase-functions/v2/https';
import {defineSecret} from 'firebase-functions/params';
import {identifier} from './domain.js';
import {verifyPaystack} from './providers.js';

const db = getFirestore();
const region = 'europe-west1';
const paystackSecret = defineSecret('PAYSTACK_SECRET_KEY');
const stamp = () => FieldValue.serverTimestamp();

async function paystackVerifyTransfer(secret, reference) {
  const response = await fetch(`https://api.paystack.co/transfer/verify/${encodeURIComponent(reference)}`, {
    headers: {Authorization: `Bearer ${secret}`},
    signal: AbortSignal.timeout(20000)
  });
  const payload = await response.json();
  if (!response.ok || payload?.status !== true || !payload.data) throw new Error(payload?.message || `Paystack HTTP ${response.status}`);
  return payload.data;
}

async function payoutByReference(reference) {
  const matches = await db.collectionGroup('websiteCreatorPayouts').where('reference', '==', reference).limit(2).get();
  if (matches.empty) return null;
  if (matches.size !== 1) throw new Error('Ambiguous payout reference');
  return matches.docs[0];
}

async function reconcilePayout(doc, verified) {
  const state = String(verified.status || '').toLowerCase();
  const org = doc.ref.parent.parent;
  if (!org) throw new Error('Creator payout organization is invalid');
  await db.runTransaction(async tx => {
    const fresh = await tx.get(doc.ref);
    if (!fresh.exists || fresh.data().state === 'paid') return;
    const payout = fresh.data();
    if (verified.reference !== payout.reference || Number(verified.amount) !== Number(payout.amountMinor) || String(verified.currency || payout.currency) !== payout.currency) {
      throw new Error('Creator payout provider verification mismatch');
    }
    if (state === 'success') {
      for (const earningId of payout.earningIds || []) {
        tx.set(org.collection('websiteTemplateEarnings').doc(earningId), {
          payoutState: 'paid_out',
          payoutReference: payout.reference,
          paidAt: stamp()
        }, {merge: true});
      }
      tx.update(doc.ref, {state: 'paid', providerState: state, transferCode: verified.transfer_code || null, paidAt: stamp(), verifiedAt: stamp()});
      return;
    }
    if (['failed','reversed'].includes(state)) {
      for (const earningId of payout.earningIds || []) {
        tx.set(org.collection('websiteTemplateEarnings').doc(earningId), {payoutState: 'pending_payout', payoutReference: null}, {merge: true});
      }
      tx.update(doc.ref, {state, providerState: state, verifiedAt: stamp()});
      return;
    }
    tx.update(doc.ref, {state: 'processing', providerState: state || 'pending', verifiedAt: stamp()});
  });
}

export const websiteCreatorPayoutPaystackWebhook = onRequest({region, secrets: [paystackSecret]}, async (req, res) => {
  if (req.method !== 'POST') { res.sendStatus(405); return; }
  const secret = paystackSecret.value();
  if (!verifyPaystack(req.rawBody, req.get('x-paystack-signature'), secret)) { res.sendStatus(401); return; }
  const event = String(req.body?.event || '');
  if (!['transfer.success','transfer.failed','transfer.reversed'].includes(event)) { res.sendStatus(200); return; }
  try {
    const reference = identifier(req.body?.data?.reference);
    const payout = await payoutByReference(reference);
    if (!payout) { res.sendStatus(200); return; }
    const verified = await paystackVerifyTransfer(secret, reference);
    await reconcilePayout(payout, verified);
    res.sendStatus(200);
  } catch (error) {
    console.error('Creator payout webhook reconciliation failed', error);
    res.sendStatus(500);
  }
});
