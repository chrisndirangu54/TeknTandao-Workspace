import test from 'node:test';
import assert from 'node:assert/strict';
import {openMinor, buildReversal, buildCredit, planNetting, applyNetting} from '../src/accounting_domain.js';

const unpaid = {id: 'inv_1', name: 'Consultation', total: 250000, currency: 'KES', paymentState: 'unpaid', contactId: 'c1'};

test('unpaid invoice reversal is an applied contra entry and rejects paid, partial, or repeat reversals', () => {
  assert.equal(openMinor(unpaid), 250000);
  const reversal = buildReversal(unpaid, 'rev_1');
  assert.equal(reversal.paymentState, 'applied');
  assert.equal(reversal.reverses, 'inv_1');
  assert.equal(reversal.total, 250000);
  assert.equal(openMinor({...reversal, id: 'rev_1'}), 0);
  assert.throws(() => buildReversal({...unpaid, paymentState: 'paid'}, 'rev_1'), /unpaid/);
  assert.throws(() => buildReversal({...unpaid, activePayment: 'pay_1'}, 'rev_1'), /in-progress/);
  assert.throws(() => buildReversal({...unpaid, nettedMinor: 1}, 'rev_1'), /netting/);
  assert.throws(() => buildReversal({...unpaid, reversedBy: 'rev_0'}, 'rev_1'), /already reversed/);
  assert.throws(() => buildReversal({...unpaid, kind: 'reversal'}, 'rev_1'), /cannot be reversed/);
});

test('credit notes are open opposite balances for exactly one party', () => {
  const credit = buildCredit({name: 'Return', total: 5000, contactId: 'c1'});
  assert.equal(openMinor({...credit, id: 'cr_1'}), -5000);
  assert.throws(() => buildCredit({name: 'Return', total: 5000, contactId: 'c1', patientId: 'p1'}));
  assert.throws(() => buildCredit({name: 'Return', total: 0, contactId: 'c1'}), /positive/);
});

test('netting offsets opposite open balances for one party and consumes them', () => {
  const credit = {...buildCredit({name: 'Return', total: 3000, contactId: 'c1'}), id: 'cr_1'};
  const plan = planNetting(unpaid, credit);
  assert.equal(plan.amount, 3000);
  assert.deepEqual(applyNetting(unpaid, 3000), {nettedMinor: 3000, paymentState: 'unpaid'});
  assert.deepEqual(applyNetting(credit, -3000), {nettedMinor: 3000, paymentState: 'netted'});
  assert.equal(openMinor({...unpaid, nettedMinor: 3000}), 247000);
  assert.throws(() => planNetting(unpaid, {...credit, contactId: 'other'}), /same customer/);
  assert.throws(() => planNetting(unpaid, {...unpaid, id: 'inv_2'}), /one amount to receive/);
  assert.throws(() => applyNetting(credit, -3001), /exceeds/);
});
