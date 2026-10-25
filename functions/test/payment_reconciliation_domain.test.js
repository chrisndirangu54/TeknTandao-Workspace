import test from 'node:test';
import assert from 'node:assert/strict';
import {planVerifiedPayment, reconcileStatementEntries} from '../src/payment_reconciliation_domain.js';

const invoice = {id:'invoice1', currency:'KES', total:50000, paymentState:'unpaid'};
const payment = {invoiceId:'invoice1', reference:'TX123', provider:'mpesa', currency:'KES', total:50000};
const evidence = {reference:'TX123', provider:'mpesa', currency:'KES', total:50000, verified:true, status:'success'};

test('verified exact settlement produces balanced payment journal', () => {
  const plan = planVerifiedPayment({invoice,payment,providerEvidence:evidence});
  assert.equal(plan.paymentState,'paid');
  assert.equal(plan.journal.total,50000);
  assert.equal(plan.journal.lines.reduce((n,l)=>n+l.debit-l.credit,0),0);
});
test('missing provider verification, mismatch and double settlement are refused', () => {
  for (const e of [{...evidence,verified:false},{...evidence,total:49999},{...evidence,reference:'OTHER'}]) {
    assert.throws(()=>planVerifiedPayment({invoice,payment,providerEvidence:e}));
  }
  assert.throws(()=>planVerifiedPayment({invoice:{...invoice,paymentState:'paid'},payment,providerEvidence:evidence}));
  assert.throws(()=>planVerifiedPayment({invoice:{...invoice,nettedMinor:100},payment,providerEvidence:evidence}));
});
test('statement reconciliation reports unmatched, duplicate and conflicting transactions', () => {
  const expected=[{reference:'A',total:100,currency:'KES',provider:'mpesa'},
    {reference:'B',total:200,currency:'KES',provider:'paystack'}];
  const observed=[{...expected[0]}, {reference:'B',total:199,currency:'KES',provider:'paystack'},
    {reference:'C',total:10,currency:'KES',provider:'mpesa'}];
  assert.deepEqual(reconcileStatementEntries({expected,observed}),
    {matched:['A'],mismatched:['B'],missing:[],unexpected:['C'],fullyReconciled:false});
  assert.throws(()=>reconcileStatementEntries({expected:[...expected,expected[0]],observed:[]}),/Duplicate/);
});
