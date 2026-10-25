import test from 'node:test';
import assert from 'node:assert/strict';
import {invoiceJournal, paymentJournal, creditJournal, trialBalance} from '../src/ledger_domain.js';

test('trial balance reconciles valid invoice, payment, and credit note', () => {
  const result = trialBalance([invoiceJournal(12000), paymentJournal(8000, 'mpesa'), creditJournal(4000)]);
  assert.equal(result.currency, 'KES');
  assert.equal(result.journalCount, 3);
  assert.equal(result.rows.reduce((sum, row) => sum + row.balance, 0), 0);
  assert.equal(result.rows.find(row => row.account === '1100').balance, 0);
});

test('trial balance rejects separately unbalanced entries even when errors cancel', () => {
  const one = {currency: 'KES', lines: [
    {account: '1100', name: 'Receivable', debit: 100, credit: 0},
    {account: '4000', name: 'Revenue', debit: 0, credit: 90}
  ]};
  const two = {currency: 'KES', lines: [
    {account: '1100', name: 'Receivable', debit: 90, credit: 0},
    {account: '4000', name: 'Revenue', debit: 0, credit: 100}
  ]};
  assert.throws(() => trialBalance([one, two]), /Journal entry must balance/);
});

test('trial balance rejects malformed entries and unsafe monetary values', () => {
  const base = invoiceJournal(100);
  assert.throws(() => trialBalance(null), /array/);
  assert.throws(() => trialBalance([{currency: 'KES', lines: []}]), /Invalid journal/);
  for (const value of [NaN, Infinity, -1, 1.5, '100', 1000000001]) {
    const invalid = structuredClone(base);
    invalid.lines[0].debit = value;
    assert.throws(() => trialBalance([invalid]), /Invalid amount/);
  }
  const bothSides = structuredClone(base);
  bothSides.lines[0].credit = 1;
  assert.throws(() => trialBalance([bothSides]), /exactly one side/);
  const emptyLine = structuredClone(base);
  emptyLine.lines[0].debit = 0;
  assert.throws(() => trialBalance([emptyLine]), /exactly one side/);
  const missingAccount = structuredClone(base);
  missingAccount.lines[0].account = '';
  assert.throws(() => trialBalance([missingAccount]), /Invalid journal account/);
});
