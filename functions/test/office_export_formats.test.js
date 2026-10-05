import test from 'node:test';
import assert from 'node:assert/strict';
import {buildCsv, buildDocx, buildPdf, buildPptx, buildXlsx} from '../src/office_export_formats.js';

function zipContains(buffer, text) {
  return buffer.includes(Buffer.from(text, 'utf8'));
}

test('CSV export preserves headers and escaped values', () => {
  const csv = buildCsv([
    {metric:'Sales', value:1200, detail:'Recorded, not cash'},
    {metric:'Tickets', value:4, detail:'Open'},
  ]).toString('utf8');
  assert.match(csv, /^metric,value,detail/);
  assert.match(csv, /"Recorded, not cash"/);
});

test('XLSX export is an OOXML zip with workbook and worksheets', () => {
  const file = buildXlsx({
    KPIs:[{metric:'Sales',value:1200}],
    Trend:[{period:'Oct',value:1200}],
  });
  assert.equal(file.subarray(0,2).toString(), 'PK');
  assert.equal(zipContains(file, 'xl/workbook.xml'), true);
  assert.equal(zipContains(file, 'xl/worksheets/sheet1.xml'), true);
  assert.equal(zipContains(file, 'Sales'), true);
});

test('DOCX export is an OOXML zip with the report text', () => {
  const file = buildDocx('Executive Intelligence', [
    {heading:'KPIs', lines:['Sales: 1200']},
  ]);
  assert.equal(file.subarray(0,2).toString(), 'PK');
  assert.equal(zipContains(file, 'word/document.xml'), true);
  assert.equal(zipContains(file, 'Executive Intelligence'), true);
});

test('PPTX export is an OOXML zip with slides and chart shapes', () => {
  const file = buildPptx([
    {title:'Executive Intelligence', lines:['Bounded report']},
    {title:'Sales trend', bars:[{label:'Sep',value:900},{label:'Oct',value:1200}]},
  ]);
  assert.equal(file.subarray(0,2).toString(), 'PK');
  assert.equal(zipContains(file, 'ppt/presentation.xml'), true);
  assert.equal(zipContains(file, 'ppt/slides/slide2.xml'), true);
  assert.equal(zipContains(file, 'Sales trend'), true);
});

test('PDF export emits a basic PDF document', () => {
  const file = buildPdf('Executive Intelligence', ['Sales: 1200','Tickets: 4']);
  assert.equal(file.subarray(0,8).toString(), '%PDF-1.4');
  assert.equal(file.includes(Buffer.from('Sales: 1200')), true);
});
