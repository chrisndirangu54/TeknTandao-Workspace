import test from 'node:test';
import assert from 'node:assert/strict';
import {crmInvoiceReconciliation} from '../src/crm_invoice_reconciliation_domain.js';
test('matches invoice to same customer and sale amount without asserting cash',()=>{
 const r=crmInvoiceReconciliation([{id:'i1',saleId:'s1',contactId:'c1',total:12000,paymentState:'unpaid'}],
 [{id:'s1',contactId:'c1',total:12000}],[{id:'c1',name:'Client'}]);
 assert.equal(r.linkedInvoices,1);
 assert.equal(r.invoices[0].verifiedCollectedMinor,null);
 assert.equal(r.invoices[0].verifiedOutstandingMinor,null);
 assert.equal(r.verifiedCollectionsAvailable,false);
});
test('detects invoice and sale mismatches and missing sale links',()=>{
 const r=crmInvoiceReconciliation([
  {id:'i1',saleId:'s1',contactId:'c1',total:12000},
  {id:'i2',contactId:'c1',total:5000}
 ],[{id:'s1',contactId:'c2',total:12000}],[]);
 assert.equal(r.unresolvedInvoices,2);
 assert.equal(r.invoices[0].matchStatus,'sale_invoice_mismatch');
 assert.equal(r.invoices[1].matchStatus,'missing_sale_link');
});
