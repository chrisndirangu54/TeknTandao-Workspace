import test from 'node:test';
import assert from 'node:assert/strict';
import {verifiedCustomerPaystackSettlement} from '../src/customer_paystack_settlement_domain.js';
const intent={state:'pending',provider:'paystack',contactId:'c1',amountMinor:3500,currency:'KES'};
const verified={status:'success',reference:'ref1',currency:'KES',amount:3500,id:123};
test('accepts only matching Paystack API verification',()=>{
 const result=verifiedCustomerPaystackSettlement(intent,verified,'ref1');
 assert.equal(result.amountMinor,3500);
 assert.equal(result.providerTransactionId,'123');
 assert.equal(result.trustBoundary,'provider_webhook_verified');
});
test('rejects untrusted, mismatched and stale payments',()=>{
 for(const v of [{...verified,amount:3000},{...verified,currency:'USD'},
 {...verified,status:'failed'},{...verified,reference:'other'}])
 assert.throws(()=>verifiedCustomerPaystackSettlement(intent,v,'ref1'),/mismatch/);
 assert.throws(()=>verifiedCustomerPaystackSettlement({...intent,state:'initializing'},verified,'ref1'),/Unrecognized/);
});
