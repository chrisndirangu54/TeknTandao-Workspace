import test from 'node:test';
import assert from 'node:assert/strict';
import {transitionEncounter,transitionAssessment,assessmentScore} from '../src/vertical_workflows_domain.js';
test('clinical encounters cannot skip consultation or reopen a completed visit',()=>{
 assert.equal(transitionEncounter('scheduled','checked_in'),'checked_in');
 assert.equal(transitionEncounter('checked_in','in_consultation'),'in_consultation');
 assert.throws(()=>transitionEncounter('scheduled','completed'),/Invalid clinical/);
 assert.throws(()=>transitionEncounter('completed','checked_in'),/Invalid clinical/);
});
test('school assessment can only publish after review',()=>{
 assert.equal(transitionAssessment('draft','review'),'review');
 assert.equal(transitionAssessment('review','published'),'published');
 assert.throws(()=>transitionAssessment('draft','published'),/Invalid school/);
 assert.throws(()=>transitionAssessment('published','draft'),/Invalid school/);
});
test('school marks are bounded and precisely normalized',()=>{
 assert.deepEqual(assessmentScore(3,4),{score:3,maxScore:4,percentBasisPoints:7500});
 assert.throws(()=>assessmentScore(5,4),/Invalid assessment/);
 assert.throws(()=>assessmentScore(-1,4),/Invalid assessment/);
});
