import test from 'node:test';
import assert from 'node:assert/strict';
import {saleInvoicePostingDecision} from '../src/sale_invoice_posting_decision.js';
const base={runExists:false,sale:{contactId:'c1',total:1000},accountingActive:true,
 periodClosed:false,invoiceExists:false,journalExists:false,taxOutboxExists:false};
test('financial posting blocks conflicting existing invoice, journal or tax record',()=>{
 for(const field of ['invoiceExists','journalExists','taxOutboxExists']){
  assert.equal(saleInvoicePostingDecision({...base,[field]:true}).action,'blocked_conflicting_financial_records');
 }
});
test('idempotent replay, missing sale and closed periods are blocked',()=>{
 assert.equal(saleInvoicePostingDecision({...base,runExists:true}).action,'already_processed');
 assert.equal(saleInvoicePostingDecision({...base,sale:null}).action,'missing_sale');
 assert.equal(saleInvoicePostingDecision({...base,periodClosed:true}).action,'blocked_closed_period');
});
test('processes complete first-time event and avoids accounting when not enabled',()=>{
 assert.deepEqual(saleInvoicePostingDecision(base),{action:'process',postAccounting:true});
 assert.equal(saleInvoicePostingDecision({...base,accountingActive:false}).postAccounting,false);
});
