import test from 'node:test';
import assert from 'node:assert/strict';
import {auditCustomerFinancialConsistency} from '../src/customer_financial_audit_domain.js';
const invoices=[{id:'i1',contactId:'c1',total:10000,allocatedMinor:3000,outstandingMinor:7000}];
const settlements=[{id:'s1',contactId:'c1',amountMinor:5000,allocatedMinor:3000}];
const allocations=[{id:'a1',invoiceId:'i1',settlementId:'s1',amountMinor:3000}];
const journals=[{id:'customer_payment_a1',total:3000}];
test('financial audit accepts consistent invoice, settlement and allocation records',()=>{
 const result=auditCustomerFinancialConsistency({invoices,settlements,allocations,journals});
 assert.equal(result.ok,true);
 assert.equal(result.errors.length,0);
});
test('audit flags missing payment journal and mismatched balances',()=>{
 const altered=[{...invoices[0],outstandingMinor:9000}];
 const result=auditCustomerFinancialConsistency({invoices:altered,settlements,allocations,journals:[]});
 assert.equal(result.ok,false);
 assert.ok(result.errors.some(e=>e.code==='missing_payment_journal'));
 assert.ok(result.errors.some(e=>e.code==='invoice_outstanding_mismatch'));
});
test('audit flags missing reversal journal',()=>{
 const result=auditCustomerFinancialConsistency({
  invoices:[{...invoices[0],allocatedMinor:0,outstandingMinor:10000}],
  settlements:[{...settlements[0],allocatedMinor:0}],
  allocations:[{...allocations[0],reversalStatus:'reversed'}],journals});
 assert.ok(result.errors.some(e=>e.code==='missing_reversal_journal'));
});
