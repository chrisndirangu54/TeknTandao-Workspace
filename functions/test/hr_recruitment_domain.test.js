import test from 'node:test';
import assert from 'node:assert/strict';
import {candidateApplication,advanceCandidate,onboardingTask} from '../src/hr_recruitment_domain.js';
test('candidate data validates contact and starts at applied',()=>{
 const candidate=candidateApplication({name:'Jane Doe',email:'JANE@EXAMPLE.COM',position:'Engineer'});
 assert.equal(candidate.email,'jane@example.com');
 assert.equal(candidate.stage,'applied');
 assert.throws(()=>candidateApplication({name:'Jane',email:'bad',position:'Engineer'}),/applicant/);
});
test('recruitment stages follow controlled path',()=>{
 assert.equal(advanceCandidate({stage:'applied'},'screening').stage,'screening');
 assert.throws(()=>advanceCandidate({stage:'applied'},'hired'),/transition/);
 assert.throws(()=>advanceCandidate({stage:'interview'},'rejected',''),/Reason/);
 assert.throws(()=>advanceCandidate({stage:'hired'},'screening'),/transition/);
});
test('onboarding tasks validate due dates and assignees',()=>{
 const task=onboardingTask({title:'Issue laptop',assigneeUid:'manager1',dueDate:'2026-12-01'});
 assert.equal(task.status,'open');
 assert.throws(()=>onboardingTask({title:'Laptop',assigneeUid:'manager1',dueDate:'2026-02-30'}),/Invalid/);
});
