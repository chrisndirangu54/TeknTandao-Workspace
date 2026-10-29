import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeCloudPlan,draftCloudPlan} from '../src/cloud_automation_planning.js';
const input={schemaVersion:1,kind:'cloud-automation-migration-request',appName:'CRM',
 repositoryUrl:'https://github.com/example/crm',stack:'Flutter web',
 provider:'Azure',monthlyBudgetUsd:40,mode:'planning-only',source:'tekntandao-html'};
test('HTML cloud automation import remains planning-only and non-executing',()=>{
 const p=draftCloudPlan(input);
 assert.equal(p.executed,false);
 assert.equal(p.plan.executionState,'not_connected');
 assert.equal(p.plan.approvedForDeployment,false);
 assert.equal(p.checklist.length,6);
 assert.equal(normalizeCloudPlan(input).provider,'Azure');
});
test('cloud plan disallows unknown origins, unsafe repositories and costs',()=>{
 for(const change of [{repositoryUrl:'http://localhost'},{monthlyBudgetUsd:-1},
 {provider:'Unapproved Cloud'},{mode:'execute'},{source:'other'},{schemaVersion:2}]){
  assert.throws(()=>normalizeCloudPlan({...input,...change}));
 }
});
