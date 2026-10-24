import test from 'node:test';
import assert from 'node:assert/strict';
import {generateCloudBlueprint,assessCloudSignals} from '../src/cloud_planning_domain.js';
test('Azure FastAPI blueprint remains planning only',()=>{
 const b=generateCloudBlueprint({stack:'Python FastAPI',provider:'Azure',monthlyBudgetUsd:40});
 assert.equal(b.target,'Azure Container Apps');assert.equal(b.planningOnly,true);
 assert.ok(b.approvalGates.includes('approve production deployment'));
});
test('monitoring avoids automatic remediation',()=>{
 const signals=assessCloudSignals([{metric:'cpuPercent',value:94}]);
 assert.equal(signals[0].severity,'review');assert.equal(signals[0].automaticRemediation,false);
 assert.throws(()=>assessCloudSignals([{metric:'invalid',value:50}]));
});
