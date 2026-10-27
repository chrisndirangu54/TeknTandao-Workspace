import test from 'node:test';
import assert from 'node:assert/strict';
import {executiveBriefingFacts} from '../src/executive_agent_domain.js';
test('includes only available requested modules with coverage metadata',()=>{
 const result=executiveBriefingFacts({
  sales:{available:true,complete:true,recordCount:2,facts:{stalled:1}},
  finance:{available:false,reason:'limit'}},['sales','finance']);
 assert.equal(result.complete,false);
 assert.deepEqual(result.sections,{sales:{stalled:1}});
 assert.equal(result.coverage.finance.reason,'limit');
});
test('blocks malformed and duplicate report scope',()=>{
 assert.throws(()=>executiveBriefingFacts({},['sales','sales']));
 assert.throws(()=>executiveBriefingFacts({},['unrecognized']));
});
test('refuses to label partial section evidence complete',()=>{
 const result=executiveBriefingFacts({hr:{available:true,complete:false,recordCount:4,facts:{}}},['hr']);
 assert.equal(result.complete,false);
 assert.equal(result.coverage.hr.reason,'incomplete_snapshot');
});
