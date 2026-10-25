import test from 'node:test';
import assert from 'node:assert/strict';
import {reconcileBankStatement} from '../src/bank_reconciliation_domain.js';
const base={reference:'ABC123',total:1200,currency:'KES',provider:'bank'};
test('reconciles only matching bank statement and journal items',()=>{
 const r=reconcileBankStatement({ledger:[base],statement:[base]});
 assert.equal(r.fullyReconciled,true);
 assert.equal(r.requiresManualReview,false);
});
test('flags amount disagreements and rejects duplicates',()=>{
 const r=reconcileBankStatement({ledger:[base],statement:[{...base,total:1100}]});
 assert.deepEqual(r.mismatched,['ABC123']);
 assert.throws(()=>reconcileBankStatement({ledger:[base,base],statement:[base]}),/Duplicate/);
});
