import {money, identifier} from './domain.js';
import {paymentJournal} from './ledger_domain.js';

// Pure reconciliation planning: caller must independently verify provider-side payment.
// This module never initiates, confirms or executes an external transfer.
export function planVerifiedPayment({invoice, payment, providerEvidence}) {
  if (!invoice || !payment || !providerEvidence) throw new Error('Invoice, payment and provider evidence required');
  if (invoice.currency !== 'KES' || payment.currency !== 'KES' || providerEvidence.currency !== 'KES') {
    throw new Error('Currency mismatch');
  }
  const provider = payment.provider;
  if (!['mpesa', 'paystack'].includes(provider) || providerEvidence.provider !== provider) {
    throw new Error('Provider mismatch');
  }
  const paymentRef = identifier(payment.reference);
  if (providerEvidence.reference !== paymentRef || providerEvidence.verified !== true ||
      providerEvidence.status !== 'success') throw new Error('Provider payment is not verified');
  if (invoice.paymentState !== 'unpaid' || invoice.reversedBy || invoice.activePayment ||
      (invoice.nettedMinor || 0) > 0) throw new Error('Invoice is not eligible for full settlement');
  const amount = money(payment.total);
  if (amount === 0 || amount !== money(invoice.total) || amount !== money(providerEvidence.total)) {
    throw new Error('Settlement amount mismatch');
  }
  if (payment.invoiceId !== invoice.id || !invoice.id) throw new Error('Payment invoice mismatch');
  return Object.freeze({
    invoiceId: identifier(invoice.id),
    reference: paymentRef,
    provider,
    total: amount,
    currency: 'KES',
    journal: paymentJournal(amount, provider),
    paymentState: 'paid'
  });
}

export function reconcileStatementEntries({expected = [], observed = []} = {}) {
  if (!Array.isArray(expected) || !Array.isArray(observed)) throw new Error('Payment lists required');
  const expectedMap = new Map();
  const observedMap = new Map();
  const add = (items, map) => {
    for (const item of items) {
      const ref = identifier(item.reference);
      const value = money(item.total);
      if (map.has(ref)) throw new Error('Duplicate payment reference');
      map.set(ref, {reference: ref, total: value, currency: item.currency, provider: item.provider});
    }
  };
  add(expected, expectedMap);
  add(observed, observedMap);
  const matched = [], mismatched = [], missing = [], unexpected = [];
  for (const [reference, value] of expectedMap) {
    const actual = observedMap.get(reference);
    if (!actual) missing.push(reference);
    else if (actual.total === value.total && actual.currency === value.currency &&
        actual.provider === value.provider) matched.push(reference);
    else mismatched.push(reference);
  }
  for (const reference of observedMap.keys()) if (!expectedMap.has(reference)) unexpected.push(reference);
  return {matched, mismatched, missing, unexpected, fullyReconciled:
    !mismatched.length && !missing.length && !unexpected.length};
}
