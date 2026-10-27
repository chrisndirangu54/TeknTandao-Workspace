import test from 'node:test';
import assert from 'node:assert/strict';
import {hrOperationsSummary} from '../src/hr_operations_agent_domain.js';
const punches=[
 {id:'p1',employeeUid:'u1',date:'2026-10-10',checkIn:'2026-10-10T08:00:00Z',checkOut:'2026-10-10T16:00:00Z'},
 {id:'p2',employeeUid:'u2',date:'2026-10-11',checkIn:'2026-10-11T08:00:00Z'},
 {id:'p3',employeeUid:'u3',date:'2026-09-01',checkIn:'2026-09-01T08:00:00Z'}
];
const leaves=[
 {startDate:'2026-10-12',endDate:'2026-10-13',status:'requested'},
 {startDate:'2026-10-15',endDate:'2026-10-16',status:'approved'},
 {startDate:'2026-11-01',endDate:'2026-11-03',status:'requested'}
];
test('summarizes a month without making absence or payroll claims',()=>{
 const r=hrOperationsSummary(punches,leaves,{month:'2026-10'});
 assert.equal(r.attendance.recordedPunches,2);
 assert.equal(r.attendance.employeeCount,2);
 assert.equal(r.attendance.missingCheckoutCount,1);
 assert.equal(r.leave.requestCount,2);
 assert.equal(r.leave.byStatus.requested,1);
 assert.equal(r.readOnly,true);
});
test('rejects invalid period and unbounded reports',()=>{
 assert.throws(()=>hrOperationsSummary([],[],{month:'2026-13'}));
 assert.throws(()=>hrOperationsSummary(Array(501).fill({}),[],{month:'2026-10'}));
});
