import test from 'node:test';
import assert from 'node:assert/strict';
import {leaveApprovalTransition} from '../src/hr_multilevel_approval_domain.js';
test('manager recommendation goes to HR and does not finalize leave',()=>{
 assert.deepEqual(leaveApprovalTransition({status:'requested'},'approved','manager'),{status:'manager_approved',final:false});
 assert.deepEqual(leaveApprovalTransition({status:'manager_approved'},'approved','owner'),{status:'approved',final:true});
});
test('manager cannot finalize a recommendation or reapprove closed leave',()=>{
 assert.throws(()=>leaveApprovalTransition({status:'manager_approved'},'approved','manager'),/Only HR/);
 assert.throws(()=>leaveApprovalTransition({status:'approved'},'approved','owner'),/not awaiting/);
});
test('rejections close requests from either approval stage',()=>{
 assert.deepEqual(leaveApprovalTransition({status:'requested'},'rejected','manager'),{status:'rejected',final:false});
 assert.deepEqual(leaveApprovalTransition({status:'manager_approved'},'rejected','owner'),{status:'rejected',final:false});
});
