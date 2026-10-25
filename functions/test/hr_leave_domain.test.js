import test from 'node:test';
import assert from 'node:assert/strict';
import {leaveRequest,overlappingLeave,leaveDecision} from '../src/hr_leave_domain.js';
const input={employeeId:'emp1',startDate:'2026-11-02',endDate:'2026-11-05',leaveType:'annual',reason:'Family time'};
test('leave requests have controlled dates, duration and purpose',()=>{
 const leave=leaveRequest(input);
 assert.equal(leave.calendarDays,4);
 assert.equal(leave.status,'requested');
 assert.throws(()=>leaveRequest({...input,startDate:'2026-02-30'}),/date/);
 assert.throws(()=>leaveRequest({...input,endDate:'2026-10-31'}),/before/);
 assert.throws(()=>leaveRequest({...input,leaveType:'unknown'}),/type/);
});
test('overlap excludes rejected leave but includes pending requests',()=>{
 const leave=leaveRequest(input);
 assert.equal(overlappingLeave(leave,[{...leave,status:'requested'}]),true);
 assert.equal(overlappingLeave(leave,[{...leave,status:'rejected'}]),false);
 assert.equal(overlappingLeave(leave,[{...leave,startDate:'2026-11-06',endDate:'2026-11-10'}]),false);
});
test('leave decision is one-way with a recorded rejection reason',()=>{
 const leave=leaveRequest(input);
 assert.equal(leaveDecision(leave,'approved').status,'approved');
 assert.throws(()=>leaveDecision(leave,'rejected',''),/reason/);
 assert.throws(()=>leaveDecision({...leave,status:'approved'},'rejected','Changed mind'),/decision/);
});
