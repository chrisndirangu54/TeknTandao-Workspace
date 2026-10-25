import test from 'node:test';
import assert from 'node:assert/strict';
import {tillReconciliation} from '../src/pos_till_domain.js';
test('till reconciles recorded cash in and out exactly',()=>{
 const result=tillReconciliation(10000,[{type:'cash_in',amountMinor:7000},{type:'cash_out',amountMinor:2000}],15000);
 assert.equal(result.expectedMinor,15000);assert.equal(result.differenceMinor,0);assert.equal(result.balanced,true);
});
test('till exposes a shortage, never silently balances a manual adjustment',()=>{
 const result=tillReconciliation(10000,[{type:'cash_in',amountMinor:5000}],12000);
 assert.equal(result.differenceMinor,-3000);assert.equal(result.balanced,false);
});
test('till rejects negative and invalid movements',()=>{
 assert.throws(()=>tillReconciliation(100,[{type:'cash_in',amountMinor:-1}],100),/amount|Invalid/);
 assert.throws(()=>tillReconciliation(100,[{type:'card',amountMinor:10}],100),/type/);
});
