import test from 'node:test';
import assert from 'node:assert/strict';
import {requireVerticalPermission} from '../src/vertical_permissions_domain.js';
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
