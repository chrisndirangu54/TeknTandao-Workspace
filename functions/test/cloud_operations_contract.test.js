import test from 'node:test';
import assert from 'node:assert/strict';
import {transitionCloudJob} from '../src/cloud_workflow_domain.js';
import {authorizeCloudAction} from '../src/cloud_policy_domain.js';
test('operation queue needs budget and both approvals',()=>{
 assert.throws(()=>transitionCloudJob('awaiting_operator','queued',{customerApproved:true,operatorApproved:true}));
 assert.equal(transitionCloudJob('awaiting_operator','queued',{customerApproved:true,operatorApproved:true,budgetReviewed:true}).state,'queued');
});
test('no cross-tenant billing or mutation policy privileges',()=>{
 assert.equal(authorizeCloudAction({actorOrgId:'A',resourceOrgId:'B',memberActive:true,role:'owner'},'approve-plan').allowed,false);
 assert.equal(authorizeCloudAction({actorOrgId:'A',resourceOrgId:'A',memberActive:true,role:'viewer'},'approve-plan').allowed,false);
});
