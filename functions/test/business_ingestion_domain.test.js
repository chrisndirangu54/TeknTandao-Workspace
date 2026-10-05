import test from 'node:test';
import assert from 'node:assert/strict';
import {
  commitShape,
  hashIngestionKey,
  normalizeExtraction,
  proposalDigest,
  safeTextInput,
  verifyIngestionKey,
} from '../src/business_ingestion_domain.js';

test('normalizes target apps and warns on low-confidence sensitive records', () => {
  const result = normalizeExtraction({
    summary: 'Receipt and stock note',
    warnings: [],
    records: [
      {
        target: 'expense',
        appId: null,
        title: 'Fuel receipt',
        fields: {vendor: 'Fuel Co', amountMinor: 125000},
        confidence: 0.62,
        evidence: ['KES 1,250.00'],
        warnings: [],
      },
      {
        target: 'inventory',
        appId: null,
        title: 'Water',
        fields: {name: 'Water', stock: 24, priceMinor: 6500},
        confidence: 0.95,
        evidence: ['24 bottles'],
        warnings: [],
      },
    ],
  });
  assert.equal(result.records[0].appId, 'expenses');
  assert.equal(result.records[0].risk, 'financial-draft');
  assert.match(result.records[0].warnings.join(' '), /draft/i);
  assert.match(result.records[0].warnings.join(' '), /low-confidence/i);
  assert.equal(result.records[1].appId, 'inventory');
});

test('ingestion API keys are hashed and verified without storing plaintext', () => {
  const token = 'ti_ing_abc.secret-value';
  const digest = hashIngestionKey(token);
  assert.equal(digest.length, 64);
  assert.equal(verifyIngestionKey(token, digest), true);
  assert.equal(verifyIngestionKey(token + 'x', digest), false);
});

test('commit shapes keep sales and expenses as review drafts', () => {
  const expense = commitShape({
    target: 'expense',
    appId: 'expenses',
    title: 'Taxi',
    fields: {vendor: 'Cab', amountMinor: 75000, currency: 'KES'},
    confidence: 1,
    evidence: [],
    warnings: [],
  });
  assert.equal(expense.kind, 'expense_draft');
  assert.equal(expense.data.state, 'draft_review');

  const sale = commitShape({
    target: 'sale',
    appId: 'pos',
    title: 'Counter sale',
    fields: {item: 'Widget', quantity: 2, totalMinor: 100000},
    confidence: 1,
    evidence: [],
    warnings: [],
  });
  assert.equal(sale.kind, 'sale_draft');
  assert.equal(sale.data.state, 'draft_review');
});

test('inventory shape rejects invalid stock', () => {
  assert.throws(
    () =>
      commitShape({
        target: 'inventory',
        appId: 'inventory',
        title: 'Bad stock',
        fields: {stock: -1, priceMinor: 100},
        confidence: 1,
        evidence: [],
        warnings: [],
      }),
    /stock/i,
  );
});

test('text and proposal digests are deterministic and bounded', () => {
  assert.equal(safeTextInput('  add stock  '), 'add stock');
  assert.throws(() => safeTextInput(''), /1-30000/);
  const a = proposalDigest({source: 'text', value: 1});
  const b = proposalDigest({source: 'text', value: 1});
  assert.equal(a, b);
});
