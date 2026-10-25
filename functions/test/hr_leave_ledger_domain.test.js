import test from 'node:test';
import assert from 'node:assert/strict';
import {leaveYear,consumeLeave,validateLeaveLedger} from '../src/hr_leave_ledger_domain.js';
test('leave ledger consumes days and preserves balance',()=>{
 const result=consumeLeave({grantedDays:21,usedDays:8},5);
 assert.deepEqual(result,{grantedDays:21,usedDays:13,remainingDays:8});
});
test('leave ledger rejects duplicate-effect overspend and corrupt balances',()=>{
 assert.throws(()=>consumeLeave({grantedDays:21,usedDays:19},3),/Insufficient/);
 assert.throws(()=>validateLeaveLedger({grantedDays:5,usedDays:6}),/Invalid/);
 assert.throws(()=>consumeLeave({grantedDays:10,usedDays:0},0),/Invalid/);
});
test('leave year validates actual Gregorian date',()=>{
 assert.equal(leaveYear('2026-12-31'),'2026');
 assert.throws(()=>leaveYear('2026-02-30'),/Invalid/);
});
