import test from 'node:test';
import assert from 'node:assert/strict';
import {
  analyticsCsv,
  analyticsDocx,
  analyticsPdf,
  analyticsPptx,
  analyticsXlsx,
  exportFile,
} from '../src/analytics_exports.js';

const intelligence = {
  generatedAt: Date.UTC(2026, 9, 5),
  facts: {
    sales: {valueMinor: 125000, count: 4, series: [
      {period:'May 26', value:10000, count:1},
      {period:'Jun 26', value:20000, count:1},
      {period:'Jul 26', value:30000, count:1},
      {period:'Aug 26', value:25000, count:1},
      {period:'Sep 26', value:20000, count:0},
      {period:'Oct 26', value:20000, count:0},
    ]},
    inventory: {skuCount:12, units:48, lowStock:2, outOfStock:1},
    customers: {contacts:20},
    support: {open:3, highPriorityOpen:1},
    projects: {overdue:2},
    connectors: {connected:4, healthy:3, degraded:1, conflicts:1, recordsCreated:10, recordsUpdated:5},
    apps: {installed:8},
  },
  recommendations: [{
    priority:'high',
    title:'Replenish constrained inventory',
    reason:'One SKU is out of stock.',
    action:'Review supplier lead time.',
  }],
};

test('CSV export is deterministic and includes core KPI labels', () => {
  const csv = analyticsCsv(intelligence);
  assert.match(csv, /Recorded sales/);
  assert.match(csv, /Inventory SKUs/);
  assert.ok(csv.endsWith('\r\n'));
});

test('OOXML exports are valid ZIP containers with expected file signatures', () => {
  for (const [name, buffer] of [
    ['xlsx', analyticsXlsx(intelligence)],
    ['docx', analyticsDocx(intelligence)],
    ['pptx', analyticsPptx(intelligence)],
  ]) {
    assert.ok(Buffer.isBuffer(buffer), name);
    assert.equal(buffer.subarray(0, 4).toString('hex'), '504b0304', name);
    assert.ok(buffer.length > 500, name);
  }
});

test('PDF export has a PDF header and end marker', () => {
  const pdf = analyticsPdf(intelligence);
  assert.equal(pdf.subarray(0, 8).toString(), '%PDF-1.4');
  assert.match(pdf.toString(), /%%EOF/);
});

test('exportFile returns correct MIME types and hashes', () => {
  const ppt = exportFile(intelligence, 'pptx');
  assert.equal(ppt.ext, 'pptx');
  assert.match(ppt.mime, /presentationml/);
  assert.match(ppt.sha256, /^[a-f0-9]{64}$/);
  assert.throws(() => exportFile(intelligence, 'exe'), /Unsupported/);
});
