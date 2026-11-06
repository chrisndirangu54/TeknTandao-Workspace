import test from 'node:test';
import assert from 'node:assert/strict';
import {reconcileSettlements} from '../src/settlement_reconciliation_domain.js';

const payment = (overrides = {}) => ({
  id: 'pay-1', orgId: 'org-1', provider: 'mpesa', reference: 'ABC123',
  amountMinor: 150000, currency: 'KES', ...overrides
});
const settlement = (overrides = {}) => ({
  id: 'settle-1', orgId: 'org-1', provider: 'mpesa', reference: 'ABC123',
  amountMinor: 150000, currency: 'KES', ...overrides
});
const input = (payments, settlements) => ({
  orgId: 'org-1', currency: 'KES', payments, settlements
});

test('one-to-one exact match is deterministic and never authorizes posting', () => {
  const result = reconcileSettlements(input([payment()], [settlement()]));
  assert.equal(result.summary.matchedAmountMinor, 150000);
  assert.equal(result.summary.readyForAutomaticPosting, false);
  assert.equal(result.summary.exceptionCount, 0);
  assert.deepEqual(result.matched[0], {
    paymentId:'pay-1', settlementId:'settle-1', provider:'mpesa',
    reference:'ABC123', amountMinor:150000
  });
});
test('rejects cross-tenant records', () => {
  assert.throws(() => reconcileSettlements(input([payment({orgId:'org-2'})], [settlement()])), /Cross-tenant/);
});
test('rejects mixed currencies and fractional amounts', () => {
  assert.throws(() => reconcileSettlements(input([payment()], [settlement({currency:'USD'})])), /Currency mismatch/);
  assert.throws(() => reconcileSettlements(input([payment({amountMinor:10.5})], [settlement()])), /positive integer/);
});
test('unmatched payment and unmatched settlement remain explicit exceptions', () => {
  const result = reconcileSettlements(input(
    [payment({reference:'X'})], [settlement({reference:'Y'})]));
  assert.deepEqual(result.exceptions.map(x=>x.type).sort(), ['unmatched_payment','unmatched_settlement']);
  assert.equal(result.summary.matchedAmountMinor, 0);
});
test('never silently resolves a mismatched amount', () => {
  const result = reconcileSettlements(input([payment()], [settlement({amountMinor:149999})]));
  assert.equal(result.summary.matchedCount, 0);
  assert.equal(result.exceptions[0].type, 'amount_mismatch');
});
test('replayed or ambiguous references are blocked', () => {
  const result = reconcileSettlements(input(
    [payment(), payment({id:'pay-2'})], [settlement()]));
  assert.equal(result.summary.matchedCount, 0);
  assert.equal(result.exceptions[0].type, 'duplicate_reference');
});
test('duplicate record ids are rejected independently on either side', () => {
  assert.throws(() => reconcileSettlements(input([payment(),payment()],[])), /Duplicate record id/);
  assert.throws(() => reconcileSettlements(input([], [settlement(),settlement()])), /Duplicate record id/);
});
test('provider identity must match the statement', () => {
  const result = reconcileSettlements(input([payment()], [settlement({provider:'paystack'})]));
  assert.equal(result.summary.exceptionCount, 2);
  assert.equal(result.summary.matchedCount, 0);
});
test('batch validation rejects malformed or unsafe input', () => {
  assert.throws(() => reconcileSettlements(input([payment({amountMinor:0})],[])), /positive integer/);
  assert.throws(() => reconcileSettlements(input([payment({reference:'bad reference'})],[])), /Invalid reference/);
  assert.throws(() => reconcileSettlements(input([], null)), /Expected payment and settlement arrays/);
});
