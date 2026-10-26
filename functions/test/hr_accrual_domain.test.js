import test from 'node:test';
import assert from 'node:assert/strict';
import {validateAccrualPolicy,accrueAnnualLeave,carryForwardLeave} from '../src/hr_accrual_domain.js';
const policy={monthlyDays:2,carryoverCapDays:5};
test('monthly accrual increases granted leave without changing used leave',()=>{
 const result=accrueAnnualLeave({year:'2026',grantedDays:10,usedDays:3},policy,'2026-10');
 assert.equal(result.grantedDays,12);
 assert.equal(result.usedDays,3);
 assert.equal(result.remainingDays,9);
});
test('accrual rejects invalid periods and policies',()=>{
 assert.throws(()=>accrueAnnualLeave({year:'2026',grantedDays:10,usedDays:0},policy,'2027-01'),/outside/);
 assert.throws(()=>validateAccrualPolicy({monthlyDays:-1,carryoverCapDays:5}),/Invalid/);
});
test('carryover is capped and requires adjacent entitlement years',()=>{
 const result=carryForwardLeave({year:'2025',grantedDays:21,usedDays:13},{year:'2026',grantedDays:2,usedDays:0},policy);
 assert.equal(result.days,5);
 assert.equal(result.grantedDays,7);
 assert.throws(()=>carryForwardLeave({year:'2024',grantedDays:20,usedDays:0},{year:'2026',grantedDays:0,usedDays:0},policy),/consecutive/);
});
