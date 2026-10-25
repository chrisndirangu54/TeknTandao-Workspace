import test from 'node:test';
import assert from 'node:assert/strict';
import {accountingPeriod,assertOpenPeriod} from '../src/accounting_period_domain.js';

test('derives validated fiscal month from posting date',()=>{
  assert.equal(accountingPeriod('2026-10-25'),'2026-10');
  assert.throws(()=>accountingPeriod('2026-02-30'),/Invalid accounting date/);
  assert.throws(()=>accountingPeriod('2026-13-01'),/Invalid accounting date/);
});
test('rejects closed and unknown accounting states',()=>{
  assert.equal(assertOpenPeriod('2026-10',undefined),'2026-10');
  assert.throws(()=>assertOpenPeriod('2026-10',{status:'closed'}),/closed/);
  assert.throws(()=>assertOpenPeriod('2026-10',{status:'undefined'}),/Unknown/);
});
