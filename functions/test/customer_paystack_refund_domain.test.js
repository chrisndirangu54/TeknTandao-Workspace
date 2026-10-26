import test from 'node:test';
import assert from 'node:assert/strict';
import {verifiedPaystackRefundEvidence} from '../src/customer_paystack_refund_domain.js';
const refund={id:99,status:'processed',transaction:123,currency:'KES',amount:3500};
const settlement={provider:'paystack',providerTransactionId:'123',providerReference:'tx1',currency:'KES',disputeState:'frozen'};
const allocation={id:'a1',invoiceId:'i1',settlementId:'s1',amountMinor:3500};
test('accepts only processed refund for matching original payment',()=>{
 const e=verifiedPaystackRefundEvidence(refund,settlement,allocation,'99');
 assert.equal(e.status,'confirmed');
 assert.equal(e.trustBoundary,'server_provider_verified');
 assert.equal(e.providerRefundId,'99');
});
test('rejects pending refund, mismatched transaction, amount and refund ID',()=>{
 for(const invalid of [{...refund,status:'processing'},{...refund,transaction:456},{...refund,amount:3000},{...refund,id:101}]){
  assert.throws(()=>verifiedPaystackRefundEvidence(invalid,settlement,allocation,'99'));
 }
});
test('rejects non-frozen and non-Paystack settlements',()=>{
 assert.throws(()=>verifiedPaystackRefundEvidence(refund,{...settlement,disputeState:'clear'},allocation,'99'));
 assert.throws(()=>verifiedPaystackRefundEvidence(refund,{...settlement,provider:'mpesa'},allocation,'99'));
});
