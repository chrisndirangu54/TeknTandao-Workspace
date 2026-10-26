import test from 'node:test';
import assert from 'node:assert/strict';
import {payrollTimeSnapshot} from '../src/hr_time_lock_domain.js';
const register={period:'2026-10',rows:[{timesheetId:'b',regularMinutes:420,approvedOvertimeMinutes:60,regularAndOvertimeMinutes:480},{timesheetId:'a',regularMinutes:450,approvedOvertimeMinutes:0,regularAndOvertimeMinutes:450}]};
test('locked time snapshots are deterministic regardless of row order',()=>{
 const a=payrollTimeSnapshot(register);
 const b=payrollTimeSnapshot({...register,rows:[...register.rows].reverse()});
 assert.equal(a.digest,b.digest);
 assert.equal(a.totalNetMinutes,930);
 assert.equal(a.approvedOvertimeMinutes,60);
 assert.equal(a.payrollPosted,false);
});
test('corrupted time allocation is rejected',()=>{
 assert.throws(()=>payrollTimeSnapshot({...register,rows:[{timesheetId:'x',regularMinutes:50,approvedOvertimeMinutes:60,regularAndOvertimeMinutes:100}]}),/Invalid/);
});
