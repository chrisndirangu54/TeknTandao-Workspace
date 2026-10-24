import test from 'node:test';
import assert from 'node:assert/strict';
import {transitionCloudJob,planRetry} from '../src/cloud_workflow_domain.js';
test('only explicit two-party approved jobs can queue',()=>{
 assert.throws(()=>transitionCloudJob('awaiting_operator','queued',{customerApproved:true}));
 assert.equal(transitionCloudJob('awaiting_operator','queued',{customerApproved:true,operatorApproved:true,budgetReviewed:true}).state,'queued');
});
test('execution must have identity and idempotency',()=>{
 assert.throws(()=>transitionCloudJob('queued','running',{idempotencyKey:'a'}));
 assert.throws(()=>transitionCloudJob('succeeded','running',{}));
});
test('retries are bounded',()=>{
 assert.equal(planRetry(1).delayMs,2000);
 assert.equal(planRetry(3).deadLetter,true);
});
