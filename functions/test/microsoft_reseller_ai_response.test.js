import test from 'node:test';
import assert from 'node:assert/strict';
import {sanitizeResellerAiNarrative,extractResellerAiNarrative} from '../src/microsoft_reseller_ai_response.js';
const valid={summary:'Needs discovery and licensing verification',discoveryQuestions:['What is the current tenant?'],implementationSteps:['Check tenant and reseller eligibility'],risks:['Subscription pricing is unverified']};
test('AI reseller output permits only bounded advisory content',()=>{
 const advice=sanitizeResellerAiNarrative(valid);
 assert.equal(advice.advisoryOnly,true);
 assert.deepEqual(extractResellerAiNarrative({candidates:[{content:{parts:[{text:JSON.stringify(valid)}]}}]}),advice);
});
test('AI reseller output rejects unauthorized fields or malformed lists',()=>{
 assert.throws(()=>sanitizeResellerAiNarrative({...valid,canProvision:true}));
 assert.throws(()=>sanitizeResellerAiNarrative({...valid,risks:[]}));
 assert.throws(()=>sanitizeResellerAiNarrative({...valid,summary:'x'.repeat(1500)}));
 assert.throws(()=>extractResellerAiNarrative({candidates:[]}));
});
