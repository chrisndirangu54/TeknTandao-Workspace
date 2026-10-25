import test from 'node:test';
import assert from 'node:assert/strict';
import {requireVerticalPermission,requireRecordScope} from '../src/vertical_permissions_domain.js';
test('clinicians may write clinical notes but not approve school grades',()=>{
 const member={role:'member'};
 assert.equal(requireVerticalPermission({app:'hospital',member,assignment:{app:'hospital',role:'clinician',active:true},permission:'clinical:write'}),true);
 assert.throws(()=>requireVerticalPermission({app:'school',member,assignment:{app:'hospital',role:'clinician',active:true},permission:'grade:write'}),/assignment/);
});
test('inactive roles and unprivileged reception staff cannot edit clinical records',()=>{
 const member={role:'member'};
 assert.throws(()=>requireVerticalPermission({app:'hospital',member,assignment:{app:'hospital',role:'clinician',active:false},permission:'clinical:write'}),/assignment/);
 assert.throws(()=>requireVerticalPermission({app:'hospital',member,assignment:{app:'hospital',role:'receptionist',active:true},permission:'clinical:write'}),/denied/);
});

test('patient-scoped clinician cannot modify an unassigned patient',()=>{
 const base={app:'hospital',member:{role:'member'},assignment:{app:'hospital',active:true,patientIds:['p1']}};
 assert.equal(requireRecordScope({...base,record:{patientId:'p1'}}),true);
 assert.throws(()=>requireRecordScope({...base,record:{patientId:'p2'}}),/not assigned/);
});
test('teacher scope is enforced by canonical student class',()=>{
 const base={app:'school',member:{role:'member'},assignment:{app:'school',active:true,classNames:['Form 1']}};
 assert.equal(requireRecordScope({...base,record:{studentId:'s1'},studentClass:'Form 1'}),true);
 assert.throws(()=>requireRecordScope({...base,record:{studentId:'s2'},studentClass:'Form 2'}),/not assigned/);
});
