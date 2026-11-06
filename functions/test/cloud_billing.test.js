import test from 'node:test';
import assert from 'node:assert/strict';
import {computeInvoice} from '../../scripts/cloud-ops/billing.mjs';
test('invoice remains draft with explicit usage and fee separation',()=>{
 const x=computeInvoice({usageUsd:10,markupPercent:10,managedServiceKes:500,exchangeKesPerUsd:130});
 assert.equal(x.usageKes,1300);assert.equal(x.markupKes,130);assert.equal(x.subtotalKes,1930);
 assert.equal(x.paymentCollected,false);
});
test('rejects negative and invalid margins',()=>{
 assert.throws(()=>computeInvoice({usageUsd:-1,markupPercent:10,managedServiceKes:0,exchangeKesPerUsd:130}));
});
