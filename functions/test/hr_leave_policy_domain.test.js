import test from 'node:test';
import assert from 'node:assert/strict';
import {validateLeavePolicy,chargeableLeaveDays,availableAnnualLeave} from '../src/hr_leave_policy_domain.js';

const policy={weekendDays:[0,6],holidays:['2026-11-04'],annualAllowanceDays:21};
test('leave policy counts only configured working days',()=>{
 const validated=validateLeavePolicy(policy);
 assert.deepEqual(validated.weekendDays,[0,6]);
 assert.equal(chargeableLeaveDays({startDate:'2026-11-02',endDate:'2026-11-06'},validated),4);
});
test('leave approval rejects requests beyond employer allowance',()=>{
 assert.equal(availableAnnualLeave({allowanceDays:21,approvedDays:10,requestedDays:4}),7);
 assert.throws(()=>availableAnnualLeave({allowanceDays:21,approvedDays:20,requestedDays:4}),/Insufficient/);
});
test('leave policies reject duplicate weekdays, invalid holidays and allowances',()=>{
 assert.throws(()=>validateLeavePolicy({...policy,weekendDays:[6,6]}),/weekend/);
 assert.throws(()=>validateLeavePolicy({...policy,holidays:['2026-02-30']}),/holiday|Invalid time/);
 assert.throws(()=>validateLeavePolicy({...policy,annualAllowanceDays:-1}),/allowance/);
});
