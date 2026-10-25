import test from 'node:test';
import assert from 'node:assert/strict';
import {planSupplierInvoiceMatch} from '../src/supplier_invoice_domain.js';
const base={invoiceId:'inv1',purchaseOrderId:'po1',supplierId:'s1',sku:'tea',warehouseId:'main',
  units:3,unitPriceMinor:100,received:5,previouslyInvoiced:1,ordered:10,status:'partially_received'};
test('supplier invoice quantities reconcile to actual receipt',()=>{
 assert.equal(planSupplierInvoiceMatch(base).totalMinor,300);
 assert.equal(planSupplierInvoiceMatch(base).invoicedTotal,4);
});
test('supplier invoice rejects overbilling, invalid status and overflow',()=>{
 assert.throws(()=>planSupplierInvoiceMatch({...base,units:5}),/exceeds received/);
 assert.throws(()=>planSupplierInvoiceMatch({...base,status:'draft'}),/not eligible/);
 assert.throws(()=>planSupplierInvoiceMatch({...base,unitPriceMinor:900000000}),/limit/);
});

import {supplierBillJournal,trialBalance} from '../src/ledger_domain.js';
test('supplier bill posts a balanced inventory asset and accounts payable journal',()=>{
 const journal=supplierBillJournal(50000);
 assert.equal(journal.total,50000);
 assert.equal(journal.lines[0].account,'1200');
 assert.equal(journal.lines[1].account,'2200');
 assert.equal(trialBalance([journal]).journalCount,1);
});
