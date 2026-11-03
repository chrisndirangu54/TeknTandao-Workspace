import test from 'node:test';
import assert from 'node:assert/strict';
import {approvalInput,approvalDecision,migrationAssessment} from '../src/foundation_governance_domain.js';
test('approval requests reject injection and unsupported operations',()=>{
  assert.throws(()=>approvalInput({kind:'transfer_funds',summary:'Transfer customer funds',targetId:'a'}));
  assert.throws(()=>approvalInput({kind:'data_migration',summary:'Valid migration plan',targetId:'a',actorUid:'other'}));
  assert.deepEqual(approvalInput({kind:'module_activation',summary:' Enable module safely ',targetId:'mod1'}),{
    kind:'module_activation',summary:'Enable module safely',targetId:'mod1'
  });
});
test('approval decisions are two-person, non-repeatable and time bounded',()=>{
  const original={status:'pending',createdBy:'user1',expiresAt:'2026-11-04T12:00:00Z'};
  assert.throws(()=>approvalDecision(original,{actorUid:'user1',decision:'approved',nowMs:Date.parse('2026-11-03T12:00:00Z')}),/Self approval/);
  assert.throws(()=>approvalDecision({...original,status:'approved'},{actorUid:'user2',decision:'approved'}),/not pending/);
  assert.throws(()=>approvalDecision(original,{actorUid:'user2',decision:'approved',nowMs:Date.parse('2026-11-05T00:00:00Z')}),/expired/);
  assert.equal(approvalDecision(original,{actorUid:'user2',decision:'rejected',nowMs:Date.parse('2026-11-03T12:00:00Z')}).status,'rejected');
});
test('legacy migration inventory explicitly forbids auto-migration',()=>{
  const report=migrationAssessment({scanned:200,missingName:12,externalReferences:5,cap:200});
  assert.equal(report.capped,true);
  assert.equal(report.readyForAutomaticMigration,false);
});
