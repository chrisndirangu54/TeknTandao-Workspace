import test from 'node:test';
import assert from 'node:assert/strict';
import {draftTimesheet,decideTimesheet} from '../src/hr_timesheets_domain.js';
const shift={id:'shift1',employeeId:'emp1',status:'scheduled'};
const evidence={punchId:'punch1',workedMinutes:540,verified:false};
test('timesheets retain raw punch evidence and deduct an explicit unpaid break',()=>{
 const sheet=draftTimesheet(shift,evidence,30,'Checked attendance');
 assert.equal(sheet.netMinutes,510);
 assert.equal(sheet.status,'pending');
 assert.equal(sheet.payrollPosted,false);
 assert.equal(sheet.punchId,'punch1');
});
test('missing punches and invalid breaks cannot be submitted',()=>{
 assert.throws(()=>draftTimesheet(shift,{workedMinutes:null},0,'Review'),/evidence/);
 assert.throws(()=>draftTimesheet(shift,evidence,541,'Review'),/break/);
 assert.throws(()=>draftTimesheet(shift,evidence,0,''),/explanation/);
});
test('supervisor decision requires a note and is one-way',()=>{
 const sheet=draftTimesheet(shift,evidence,30,'Reviewed');
 assert.equal(decideTimesheet(sheet,'approved','Reviewed the clock evidence').status,'approved');
 assert.throws(()=>decideTimesheet(sheet,'rejected',''),/note/);
 assert.throws(()=>decideTimesheet({...sheet,status:'approved'},'approved','Repeat'),/cannot be decided/);
});
