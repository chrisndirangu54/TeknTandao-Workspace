import test from 'node:test';
import assert from 'node:assert/strict';
import {validateAppointment,validateAttendance} from '../src/vertical_operations_domain.js';
test('rejects overlapping appointments for same resource',()=>{
 const existing=[{resourceId:'room1',startAt:'2026-10-26T09:00:00Z',endAt:'2026-10-26T10:00:00Z',status:'scheduled'}];
 assert.throws(()=>validateAppointment({resourceId:'room1',startAt:'2026-10-26T09:30:00Z',endAt:'2026-10-26T10:30:00Z'},existing),/conflict/);
 assert.equal(validateAppointment({resourceId:'room2',startAt:'2026-10-26T09:30:00Z',endAt:'2026-10-26T10:30:00Z'},existing).resourceId,'room2');
});
test('attendance rejects invalid days and unsupported outcomes',()=>{
 assert.deepEqual(validateAttendance({studentId:'s1',date:'2026-10-26',status:'late'}),{studentId:'s1',date:'2026-10-26',status:'late'});
 assert.throws(()=>validateAttendance({studentId:'s1',date:'2026-02-30',status:'present'}),/date/);
 assert.throws(()=>validateAttendance({studentId:'s1',date:'2026-10-26',status:'unknown'}),/status/);
});
