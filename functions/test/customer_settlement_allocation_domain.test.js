import test from 'node:test';
import assert from 'node:assert/strict';
import {invoiceAllocationDecision} from '../src/customer_settlement_allocation_domain.js';
const invoice={contactId:'customer-1',currency:'KES',total:10000};
const verified={contactId:'customer-1',currency:'KES',amountMinor:10000,
 verificationStatus:'verified',verificationSource:'daraja_api'};
test('verified evidence permits partial and completed invoice allocations',()=>{
 const first=invoiceAllocationDecision(invoice,verified,[],4000);
 assert.equal(first.remainingInvoiceMinor,6000);assert.equal(first.status,'partial');
 const second=invoiceAllocationDecision(invoice,verified,[{id:'a',amountMinor:4000}],6000);
 assert.equal(second.remainingInvoiceMinor,0);assert.equal(second.status,'settled');
});
test('rejects unverified payment, mismatches, over-allocation and corrupt history',()=>{
 assert.throws(()=>invoiceAllocationDecision(invoice,{...verified,verificationStatus:'pending'},[],1000),/Verified/);
 assert.throws(()=>invoiceAllocationDecision(invoice,{...verified,contactId:'other'},[],1000),/mismatch/);
 assert.throws(()=>invoiceAllocationDecision(invoice,verified,[],10001),/exceeds/);
 assert.throws(()=>invoiceAllocationDecision(invoice,verified,[{id:'x',amountMinor:2000},{id:'x',amountMinor:2000}],1000),/duplicate/);
});
