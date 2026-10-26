import test from 'node:test';
import assert from 'node:assert/strict';
import {suppressActiveEnrollments,suppressionState} from '../src/crm_sequence_suppression_domain.js';
test('channel opt-out stops only matching active enrollments',()=>{
 const rows=[{id:'a',channel:'email',status:'active'},{id:'b',channel:'whatsapp',status:'active'},
  {id:'c',channel:'email',status:'stopped'}];
 assert.deepEqual(suppressActiveEnrollments(rows,'email'),['a']);
 assert.deepEqual(suppressActiveEnrollments(rows,'all'),['a','b']);
});
test('state summarizes global and channel-level suppression',()=>{
 const state=suppressionState({},[{channel:'whatsapp',status:'suppressed'}]);
 assert.deepEqual(state.blockedChannels,['whatsapp']);
 assert.equal(suppressionState({doNotContact:true},[]).doNotContact,true);
 assert.throws(()=>suppressActiveEnrollments([],'telegram'),/Invalid/);
});
