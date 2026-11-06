import test from 'node:test';
import assert from 'node:assert/strict';
import {describeClinicalModel, validateHospitalClinicalTask, requireClinicalEvaluation} from '../src/hospital_clinical_ai_domain.js';

test('model registry is not clinically accredited',()=>{
 const model=describeClinicalModel('medgemma-1.5-4b');
 assert.equal(model.clinicalApproved,false);
 assert.match(model.card,/^https:\/\//);
});
test('reject autonomous diagnostic task',()=>{
 assert.throws(()=>validateHospitalClinicalTask('diagnose'),/Unsupported/);
});
test('microbiology and imaging not released by evaluation score alone',()=>{
 for(const domain of ['radiology','microscopy','antimicrobial_susceptibility']){
   const gate=requireClinicalEvaluation({domain,externalValidationConfirmed:false,clinicalApproval:false});
   assert.equal(gate.deployable,false);
 }
});
