import test from 'node:test';
import assert from 'node:assert/strict';
import {performanceFeedback,developmentPlan,advanceDevelopmentPlan} from '../src/hr_growth_domain.js';
test('feedback is participant-visible, categorized and bounded',()=>{
 assert.equal(performanceFeedback({category:'coaching',message:' Improve documentation '}).message,'Improve documentation');
 assert.throws(()=>performanceFeedback({category:'anonymous',message:'Great'}),/category/);
 assert.throws(()=>performanceFeedback({category:'recognition',message:' '}),/message/);
});
test('development plans validate deadlines and lifecycle transitions',()=>{
 const plan=developmentPlan({title:'Improve presentations',description:'Practice monthly',dueDate:'2027-01-31'});
 assert.equal(plan.status,'planned');
 assert.equal(advanceDevelopmentPlan(plan,'in_progress').status,'in_progress');
 assert.throws(()=>advanceDevelopmentPlan(plan,'completed'),/transition/);
 assert.throws(()=>developmentPlan({title:'Goal',description:'Plan',dueDate:'2027-02-30'}),/date/);
});
