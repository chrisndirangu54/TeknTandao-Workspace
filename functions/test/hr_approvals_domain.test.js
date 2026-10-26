import test from 'node:test';
import assert from 'node:assert/strict';
import {authorizeLeaveApprover,validateLeaveManagerAssignment} from '../src/hr_approvals_domain.js';
const member={role:'member'};
const assignment={role:'leave_manager',active:true,managerUid:'manager1',departments:['Engineering']};
test('leave managers approve only their own departments',()=>{
 assert.equal(authorizeLeaveApprover({member,assignment,employee:{department:'Engineering',portalUid:'employee1'},approverUid:'manager1'}),true);
 assert.throws(()=>authorizeLeaveApprover({member,assignment,employee:{department:'Finance',portalUid:'employee1'},approverUid:'manager1'}),/department/);
});
test('inactive managers and self approval are denied',()=>{
 assert.throws(()=>authorizeLeaveApprover({member,assignment:{...assignment,active:false},employee:{department:'Engineering'},approverUid:'manager1'}),/Active/);
 assert.throws(()=>authorizeLeaveApprover({member,assignment,employee:{department:'Engineering',portalUid:'manager1'},approverUid:'manager1'}),/Self approval/);
 assert.throws(()=>authorizeLeaveApprover({member,assignment,employee:{department:'Engineering'},approverUid:'other'}),/identity/);
});
test('manager scopes must specify valid departments',()=>{
 assert.deepEqual(validateLeaveManagerAssignment({managerUid:'manager1',departments:['Engineering'],active:true}).departments,['Engineering']);
 assert.throws(()=>validateLeaveManagerAssignment({managerUid:'manager1',departments:[],active:true}),/Invalid/);
});
