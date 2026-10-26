import test from 'node:test';
import assert from 'node:assert/strict';
import {settlementReversalJournal,validateConfirmedReversal} from '../src/customer_reversal_posting_domain.js';
const allocation={amountMinor:2500};
const settlement={disputeState:'frozen',provider:'paystack',providerReference:'payment-1'};
const evidence={status:'confirmed',kind:'chargeback',amountMinor:2500,providerReference:'payment-1',source:'paystack_api'};
test('reversal policy creates balanced receivable/clearing journal',()=>{
 const result=validateConfirmedReversal(allocation,settlement,evidence);
 assert.equal(result.journal.total,2500);
 assert.equal(result.journal.lines.reduce((sum,x)=>sum+x.debit,0),2500);
 assert.equal(result.journal.lines.reduce((sum,x)=>sum+x.credit,0),2500);
});
test('refuses unconfirmed refund and wrong reference, amount or provider',()=>{
 for(const bad of [
  {...evidence,status:'requested'}, {...evidence,amountMinor:2600},
  {...evidence,providerReference:'other'}, {...evidence,source:'manual'}
 ])assert.throws(()=>validateConfirmedReversal(allocation,settlement,bad),/confirmation|Unsupported/);
 assert.throws(()=>settlementReversalJournal(100,'unknown'),/Unsupported/);
});
