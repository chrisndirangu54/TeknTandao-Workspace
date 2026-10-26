import test from 'node:test';
import assert from 'node:assert/strict';
import {customerReversalReviewState} from '../src/customer_reversal_review_domain.js';
test('creates one pending review with immutable amount',()=>{
 assert.deepEqual(customerReversalReviewState(null,{status:'review_required',reversalMinor:2500}),
  {create:true,status:'pending_provider_evidence',amountMinor:2500});
});
test('retry returns existing review without creating a second one',()=>{
 assert.deepEqual(customerReversalReviewState({status:'pending_provider_evidence'},null),
  {create:false,status:'pending_provider_evidence'});
});
test('refuses unsupported or invalid reversal requests',()=>{
 assert.throws(()=>customerReversalReviewState(null,{status:'already_reversed',reversalMinor:100}),/not eligible/);
 assert.throws(()=>customerReversalReviewState(null,{status:'review_required',reversalMinor:0}),/not eligible/);
});
