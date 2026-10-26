import test from 'node:test';
import assert from 'node:assert/strict';
import {proposeHrTimeCorrection,decideHrTimeCorrection} from '../src/hr_time_corrections_domain.js';
const lock={status:'locked',digest:'digest1',rows:[{timesheetId:'shift1',regularMinutes:480,approvedOvertimeMinutes:60}]};
test('correction preserves immutable snapshot reference and new values',()=>{
 const result=proposeHrTimeCorrection(lock,{timesheetId:'shift1',regularMinutes:470,approvedOvertimeMinutes:60,reason:'Corrected break'});
 assert.equal(result.originalDigest,'digest1');
 assert.equal(result.status,'pending');
 assert.equal(result.payrollPosted,false);
});
test('correction must alter an existing timesheet with valid minutes',()=>{
 assert.throws(()=>proposeHrTimeCorrection(lock,{timesheetId:'wrong',regularMinutes:470,approvedOvertimeMinutes:60,reason:'Correction'}),/absent/);
 assert.throws(()=>proposeHrTimeCorrection(lock,{timesheetId:'shift1',regularMinutes:480,approvedOvertimeMinutes:60,reason:'Correction'}),/change/);
 assert.throws(()=>proposeHrTimeCorrection(lock,{timesheetId:'shift1',regularMinutes:1500,approvedOvertimeMinutes:0,reason:'Correction'}),/Invalid/);
});
test('HR decision requires independent recorded justification',()=>{
 const request=proposeHrTimeCorrection(lock,{timesheetId:'shift1',regularMinutes:470,approvedOvertimeMinutes:60,reason:'Corrected break'});
 assert.equal(decideHrTimeCorrection(request,'approved','Verified employee explanation').status,'approved');
 assert.throws(()=>decideHrTimeCorrection(request,'approved',''),/note/);
 assert.throws(()=>decideHrTimeCorrection({...request,status:'approved'},'rejected','Retry'),/decision/);
});
