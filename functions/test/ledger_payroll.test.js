import test from 'node:test';
import assert from 'node:assert/strict';
import {invoiceJournal, creditJournal, paymentJournal, payrollJournal, trialBalance} from '../src/ledger_domain.js';
import {statutoryPayroll} from '../src/payroll_domain.js';

test('a KES 100,000 salary matches the February 2026 statutory worked example and posts a balanced journal', () => {
  const slip = statutoryPayroll(10_000_000);
  assert.equal(slip.rateCard, 'KE-2026-02');
  assert.equal(slip.nssfEmployeeMinor, 600_000);
  assert.equal(slip.shifMinor, 275_000);
  assert.equal(slip.housingEmployeeMinor, 150_000);
  assert.equal(slip.taxableMinor, 8_975_000);
  assert.equal(slip.payeMinor, 1_930_800);
  assert.equal(slip.netMinor, 7_044_200);
  assert.equal(slip.employerCostMinor, 10_750_000);
  const low = statutoryPayroll(1_000_000);
  assert.equal(low.shifMinor, 30_000);
  const openBooks = trialBalance([invoiceJournal(10_000_000), creditJournal(500_000)]);
  assert.equal(openBooks.rows.find(row => row.account === '1100').balance, 9_500_000);
  const balance = trialBalance([invoiceJournal(10_000_000), creditJournal(500_000), paymentJournal(9_500_000, 'mpesa'), payrollJournal({...slip, period: '2026-09'})]);
  assert.equal(balance.rows.reduce((sum, row) => sum + row.balance, 0), 0);
  assert.throws(() => trialBalance([{currency: 'KES', lines: [{account: '1100', name: 'AR', debit: 1, credit: 0}]}]), /out of balance/);
});
