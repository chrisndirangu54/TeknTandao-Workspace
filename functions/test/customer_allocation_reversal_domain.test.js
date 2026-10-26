import test from 'node:test';
import assert from 'node:assert/strict';
import {planCustomerAllocationReversal} from '../src/customer_allocation_reversal_domain.js';
const invoice={id:'inv',total:10000,allocatedMinor:7000};
const settlement={id:'pay',amountMinor:9000,allocatedMinor:7000,disputeState:'frozen'};
const allocation={id:'a',invoiceId:'inv',settlementId:'pay',amountMinor:3000};
test('projects disputed allocation reversal without posting cash movements',()=>{
 const result=planCustomerAllocationReversal(invoice,settlement,allocation);
 assert.equal(result.status,'review_required');
 assert.equal(result.projectedInvoiceOutstandingMinor,6000);
 assert.equal(result.projectedPaymentAvailableMinor,5000);
});
test('refuses unconfirmed disputes, mismatched links and corrupted counters',()=>{
 assert.throws(()=>planCustomerAllocationReversal(invoice,{...settlement,disputeState:'clear'},allocation),/frozen/);
 assert.throws(()=>planCustomerAllocationReversal(invoice,settlement,{...allocation,invoiceId:'another'}),/mismatch/);
 assert.throws(()=>planCustomerAllocationReversal({...invoice,allocatedMinor:1000},settlement,allocation),/Inconsistent/);
 assert.deepEqual(planCustomerAllocationReversal(invoice,settlement,{...allocation,reversalStatus:'reversed'}),{status:'already_reversed'});
});
