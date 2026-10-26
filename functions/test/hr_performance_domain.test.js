import test from 'node:test';
import assert from 'node:assert/strict';
import {createReview,reviewAssessment} from '../src/hr_performance_domain.js';
const input={employeeId:'employee1',managerUid:'manager1',startDate:'2026-01-01',endDate:'2026-12-31',
 goals:[{title:'Customer satisfaction',weight:60},{title:'Timely delivery',weight:40}]};
test('performance reviews have bounded goals and weights totalling 100',()=>{
 const review=createReview(input);
 assert.equal(review.status,'self_assessment');
 assert.throws(()=>createReview({...input,goals:[{title:'A',weight:20}]}),/total 100/);
 assert.throws(()=>createReview({...input,endDate:'2025-01-01'}),/dates/);
});
test('self appraisal and manager review have separate stages',()=>{
 const review=createReview(input);
 const employee=reviewAssessment(review,'employee',{ratings:[5,3],comment:'Goals reviewed'});
 assert.equal(employee.weightedScore,4.2);
 assert.throws(()=>reviewAssessment(review,'manager',{ratings:[5,5],comment:'Reviewed'}),/stage/);
 const manager=reviewAssessment({...review,status:'manager_review'},'manager',{ratings:[4,4],comment:'Meets expectations'});
 assert.equal(manager.weightedScore,4);
 assert.throws(()=>reviewAssessment(review,'employee',{ratings:[0,5],comment:'Invalid'}),/Ratings/);
});
