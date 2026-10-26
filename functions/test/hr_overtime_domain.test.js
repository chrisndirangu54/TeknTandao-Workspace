import test from 'node:test';
import assert from 'node:assert/strict';
import {proposeOvertime,decideOvertime} from '../src/hr_overtime_domain.js';
const shift={id:'shift1',employeeId:'emp1',status:'scheduled',startAt:'2026-11-02T08:00:00Z',endAt:'2026-11-02T16:00:00Z'};
const sheet={shiftId:'shift1',employeeId:'emp1',status:'approved',netMinutes:560,payrollPosted:false};
test('overtime cannot exceed approved net hours beyond scheduled duration',()=>{
 const result=proposeOvertime(sheet,shift,80,'Urgent maintenance');
 assert.equal(result.status,'pending');
 assert.equal(result.minutes,80);
 assert.equal(result.payrollPosted,false);
 assert.throws(()=>proposeOvertime(sheet,shift,81,'Extra'),/exceeds/);
});
test('unapproved timesheets and mismatched shifts are rejected',()=>{
 assert.throws(()=>proposeOvertime({...sheet,status:'pending'},shift,10,'Extra'),/Approved/);
 assert.throws(()=>proposeOvertime(sheet,{...shift,id:'different'},10,'Extra'),/mismatch/);
 assert.throws(()=>proposeOvertime(sheet,shift,0,'Extra'),/exceeds/);
});
test('overtime decisions are one-way with mandatory notes',()=>{
 const entry=proposeOvertime(sheet,shift,60,'Extra');
 assert.equal(decideOvertime(entry,'approved','Reviewed').status,'approved');
 assert.throws(()=>decideOvertime(entry,'approved',''),/note/);
 assert.throws(()=>decideOvertime({...entry,status:'approved'},'rejected','Review'),/not permitted/);
});
