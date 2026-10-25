import test from 'node:test';
import assert from 'node:assert/strict';
import {provisionalCashFlow} from '../src/cash_flow_domain.js';
test('classifies balanced cash receipt as operating movement',()=>{
 const r=provisionalCashFlow([{currency:'KES',lines:[{account:'1000',name:'Cash',debit:100,credit:0},{account:'4000',name:'Sales',debit:0,credit:100}]}]);
 assert.equal(r.sections.operatingMinor,100);
 assert.equal(r.cashMovementMinor,100);
 assert.equal(r.reconciles,true);
});
test('reconciliation excludes noncash journals',()=>{
 const r=provisionalCashFlow([{currency:'KES',lines:[{account:'1100',name:'AR',debit:100,credit:0},{account:'4000',name:'Sales',debit:0,credit:100}]}]);
 assert.equal(r.cashMovementMinor,0);
});
