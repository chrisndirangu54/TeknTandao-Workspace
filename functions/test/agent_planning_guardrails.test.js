import test from 'node:test';
import assert from 'node:assert/strict';
import {buildPlan, readySteps, evaluateStepResult} from '../src/agentic_orchestration_domain.js';

const objective={title:'Follow up with customer', risk:'medium'};
test('agent planner refuses cyclic and unknown dependencies',()=>{
 assert.throws(()=>buildPlan(objective,[{id:'a',action:'read',dependsOn:['b']},{id:'b',action:'write',dependsOn:['a']}]),/cyclic/);
 assert.throws(()=>buildPlan(objective,[{id:'a',action:'read',dependsOn:['missing']}]),/unknown/);
});
test('failed prerequisites block dependent actions',()=>{
 const plan=buildPlan(objective,[{id:'read',action:'read'},{id:'write',action:'write',dependsOn:['read']}]);
 assert.deepEqual(readySteps(plan,{completed:[],failed:['read']}),[]);
});
test('agent execution requires affirmative policy evidence and full expected observations',()=>{
 const step={expectedEvidence:['record_read','owner_approved']};
 assert.equal(evaluateStepResult(step,{toolSucceeded:true,confidence:1,evidence:['record_read','owner_approved']}).accepted,false);
 assert.equal(evaluateStepResult(step,{policyPassed:true,toolSucceeded:true,confidence:1,evidence:['record_read']}).accepted,false);
 assert.equal(evaluateStepResult(step,{policyPassed:true,toolSucceeded:true,confidence:1,evidence:['record_read','owner_approved']}).accepted,true);
});
