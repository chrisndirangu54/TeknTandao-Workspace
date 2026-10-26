import test from 'node:test';
import assert from 'node:assert/strict';
import {validateShift,shiftConflicts,changeShiftStatus} from '../src/hr_shifts_domain.js';
const shift=validateShift({employeeId:'emp1',startAt:'2026-11-02T08:00:00Z',endAt:'2026-11-02T17:00:00Z',title:'Morning'});
test('shift validates UTC interval and duration',()=>{
 assert.equal(shift.durationMinutes,540);
 assert.throws(()=>validateShift({...shift,endAt:'2026-11-02T07:00:00Z'}),/interval/);
 assert.throws(()=>validateShift({...shift,endAt:'2026-11-04T08:00:00Z'}),/24 hours/);
});
test('overlapping shifts and approved leave block scheduling',()=>{
 assert.throws(()=>shiftConflicts(shift,[{...shift,startAt:'2026-11-02T16:00:00Z',endAt:'2026-11-02T20:00:00Z'}],[]),/overlaps/);
 assert.throws(()=>shiftConflicts(shift,[],[{status:'approved',startDate:'2026-11-02',endDate:'2026-11-03'}]),/leave/);
 assert.doesNotThrow(()=>shiftConflicts(shift,[],[{status:'requested',startDate:'2026-11-02',endDate:'2026-11-03'}]));
});
test('only scheduled shifts can be cancelled',()=>{
 assert.equal(changeShiftStatus(shift,'cancelled').status,'cancelled');
 assert.throws(()=>changeShiftStatus({...shift,status:'cancelled'},'cancelled'),/Only scheduled/);
});
