import test from 'node:test';
import assert from 'node:assert/strict';
import {payrollTimeRegister} from '../src/hr_payroll_time_domain.js';
const sheet={id:'shift1',period:'2026-10',status:'approved',netMinutes:540};
const extra={id:'shift1',timesheetId:'shift1',period:'2026-10',status:'approved',minutes:60};
test('approved overtime is a subset of net time, not added twice',()=>{
 const report=payrollTimeRegister('2026-10',[sheet],[extra]);
 assert.equal(report.totalNetMinutes,540);
 assert.equal(report.approvedOvertimeMinutes,60);
 assert.equal(report.rows[0].regularMinutes,480);
 assert.equal(report.payrollPosted,false);
});
test('pending time and overtime do not enter payroll register',()=>{
 const report=payrollTimeRegister('2026-10',[sheet,{...sheet,id:'pending',status:'pending'}],[{...extra,status:'pending'}]);
 assert.equal(report.totalNetMinutes,540);
 assert.equal(report.approvedOvertimeMinutes,0);
});
test('duplicate or excess overtime is rejected',()=>{
 assert.throws(()=>payrollTimeRegister('2026-10',[sheet,sheet],[]),/Duplicate/);
 assert.throws(()=>payrollTimeRegister('2026-10',[sheet],[{...extra,minutes:541}]),/Invalid overtime/);
});
