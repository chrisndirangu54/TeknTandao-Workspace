import test from 'node:test';
import assert from 'node:assert/strict';
import {crmCommerceSummary} from '../src/crm_commerce_domain.js';
test('customer records align across CRM POS and invoices without summing',()=>{
 const result=crmCommerceSummary([{id:'c1',name:'Customer'}],
 [{contactId:'c1',stage:'won',amountMinor:50000}],
 [{contactId:'c1',total:40000}],
 [{contactId:'c1',total:40000,paymentState:'unpaid'}]);
 assert.equal(result[0].wonOpportunityMinor,50000);
 assert.equal(result[0].posSaleMinor,40000);
 assert.equal(result[0].invoiceMinor,40000);
 assert.equal(result[0].paidInvoiceStatusCount,0);
});
test('snapshot reporting rejects oversized data',()=>{
 assert.throws(()=>crmCommerceSummary(Array(501).fill({}),[],[],[]),/unsupported/);
});
