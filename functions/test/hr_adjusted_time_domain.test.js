import test from 'node:test';
import assert from 'node:assert/strict';
import {adjustedTimeRegister} from '../src/hr_adjusted_time_domain.js';
const lock={status:'locked',period:'2026-10',digest:'original',rows:[{timesheetId:'shift1',regularMinutes:480,approvedOvertimeMinutes:60,netMinutes:540}]};
test('approved correction creates separate projection without mutating locked source',()=>{
 const r=adjustedTimeRegister(lock,[{id:'c1',status:'approved',originalDigest:'original',timesheetId:'shift1',regularMinutes:470,approvedOvertimeMinutes:60}]);
 assert.equal(r.totalNetMinutes,530);
 assert.equal(lock.rows[0].netMinutes,540);
 assert.equal(r.payrollPosted,false);
 assert.equal(r.applied[0].correctionId,'c1');
});
test('unapproved corrections are excluded and conflicts fail closed',()=>{
 assert.equal(adjustedTimeRegister(lock,[{id:'c1',status:'pending'}]).totalNetMinutes,540);
 const c={id:'c1',status:'approved',originalDigest:'original',timesheetId:'shift1',regularMinutes:470,approvedOvertimeMinutes:60};
 assert.throws(()=>adjustedTimeRegister(lock,[c,{...c,id:'c2'}]),/Competing/);
 assert.throws(()=>adjustedTimeRegister(lock,[{...c,originalDigest:'different'}]),/mismatch/);
});
