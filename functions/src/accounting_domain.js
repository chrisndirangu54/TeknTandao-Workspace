import {identifier, textValue, money} from './domain.js';

function currencyOf(invoice) {
  const currency = invoice.currency || 'KES';
  if (!/^[A-Z]{3}$/.test(currency)) throw new Error('Invalid currency');
  return currency;
}

export function openMinor(invoice) {
  if (!invoice || typeof invoice !== 'object') throw new Error('Invoice unavailable');
  if (invoice.activePayment) throw new Error('Resolve the in-progress payment first');
  const state = invoice.paymentState;
  if (invoice.reversedBy || ['void', 'paid', 'netted', 'reversed', 'applied'].includes(state)) return 0;
  const total = money(invoice.total);
  const netted = invoice.nettedMinor == null ? 0 : money(invoice.nettedMinor);
  if (netted > total) throw new Error('Invoice netting exceeds its total');
  const remaining = total - netted;
  if (invoice.kind === 'reversal' || state === 'reversal') return -remaining;
  if (state == null || state === 'unpaid') return remaining;
  return 0;
}

export function buildReversal(invoice, reversalId) {
  identifier(reversalId);
  if (!invoice?.id) throw new Error('Invoice unavailable');
  identifier(invoice.id);
  if (invoice.kind === 'reversal') throw new Error('A reversal cannot be reversed here');
  if (invoice.reversedBy) throw new Error('Invoice is already reversed');
  if (invoice.activePayment) throw new Error('Resolve the in-progress payment before reversal');
  if (invoice.paymentState && invoice.paymentState !== 'unpaid') throw new Error('Only an unpaid invoice can be reversed');
  if ((invoice.nettedMinor || 0) !== 0) throw new Error('Remove netting before reversing this invoice');
  const total = money(invoice.total);
  const raw = typeof invoice.name === 'string' && invoice.name.trim() ? invoice.name.trim() : invoice.id;
  const name = `Reversal of ${raw}`.slice(0, 200);
  const reversal = {
    kind: 'reversal', name, reverses: invoice.id, total, currency: currencyOf(invoice),
    source: invoice.source || 'accounting', paymentState: 'applied',
  };
  if (invoice.contactId) reversal.contactId = identifier(invoice.contactId);
  if (invoice.patientId) reversal.patientId = identifier(invoice.patientId);
  return reversal;
}

export function buildCredit(input) {
  const total = money(input.total);
  if (total <= 0) throw new Error('Credit must be a positive amount');
  const contactId = input.contactId ? identifier(input.contactId) : null;
  const patientId = input.patientId ? identifier(input.patientId) : null;
  if (Boolean(contactId) === Boolean(patientId)) throw new Error('Credit belongs to one customer or one patient');
  const credit = {
    kind: 'reversal', name: textValue(input.name), total, currency: 'KES', source: 'accounting', paymentState: 'reversal',
  };
  if (contactId) credit.contactId = contactId;
  if (patientId) credit.patientId = patientId;
  return credit;
}

export function planNetting(left, right) {
  if (!left?.id || !right?.id || left.id === right.id) throw new Error('Choose two different invoices');
  const leftParty = left.contactId || left.patientId;
  const rightParty = right.contactId || right.patientId;
  if (!leftParty || leftParty !== rightParty || Boolean(left.contactId) !== Boolean(right.contactId)) {
    throw new Error('Netting requires the same customer or patient');
  }
  if (currencyOf(left) !== currencyOf(right)) throw new Error('Currency mismatch');
  const a = openMinor(left);
  const b = openMinor(right);
  if (a === 0 || b === 0 || Math.sign(a) === Math.sign(b)) throw new Error('Netting needs one amount to receive and one amount to pay');
  const amount = Math.min(Math.abs(a), Math.abs(b));
  return {amount, currency: currencyOf(left), allocations: [
    {id: left.id, apply: Math.sign(a) * amount},
    {id: right.id, apply: Math.sign(b) * amount},
  ]};
}

export function applyNetting(invoice, applySigned) {
  const open = openMinor(invoice);
  if (!Number.isSafeInteger(applySigned) || applySigned === 0 || Math.sign(applySigned) !== Math.sign(open) || Math.abs(applySigned) > Math.abs(open)) {
    throw new Error('Netting amount exceeds the open balance');
  }
  const nettedMinor = money((invoice.nettedMinor || 0) + Math.abs(applySigned));
  return {nettedMinor, paymentState: nettedMinor === money(invoice.total) ? 'netted' : (invoice.paymentState || 'unpaid')};
}
