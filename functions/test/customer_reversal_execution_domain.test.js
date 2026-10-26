import test from 'node:test';
import assert from 'node:assert/strict';
import {planPostedCustomerReversal} from '../src/customer_reversal_execution_domain.js';
const invoice={id:'i1',total:10000,allocatedMinor:5000};
const settlement={id:'s1',provider:'paystack',providerReference:'r1',
 amountMinor:10000,allocatedMinor:5000,disputeState:'frozen'};
const allocation={id:'a1',invoiceId:'i1',settlementId:'s1',amountMinor:5000};
const review={status:'pending_provider_evidence',allocationId:'a1',invoiceId:'i1',settlementId:'s1'};
const evidence={status:'confirmed',kind:'refund',source:'paystack_api',providerReference:'r1',
 amountMinor:5000,trustBoundary:'server_provider_verified',allocationId:'a1',invoiceId:'i1',settlementId:'s1'};
test('plans balanced reversal from matching server-confirmed evidence',()=>{
 const plan=planPostedCustomerReversal({invoice,settlement,allocation,review,evidence});
 assert.equal(plan.invoiceAllocatedMinor,0);
 assert.equal(plan.projectedInvoiceOutstandingMinor,10000);
 assert.equal(plan.journal.lines.reduce((a,l)=>a+l.debit,0),5000);
 assert.equal(plan.journal.lines.reduce((a,l)=>a+l.credit,0),5000);
});
test('rejects caller claims, wrong records and unfinished provider confirmation',()=>{
 const base={invoice,settlement,allocation,review,evidence};
 assert.throws(()=>planPostedCustomerReversal({...base,evidence:{...evidence,trustBoundary:'client'}}),/Server-verified/);
 assert.throws(()=>planPostedCustomerReversal({...base,review:{...review,invoiceId:'another'}}),/references/);
 assert.throws(()=>planPostedCustomerReversal({...base,evidence:{...evidence,status:'pending'}}),/confirmation/);
});
