import test from 'node:test';
import assert from 'node:assert/strict';
import {serviceSchema,normalizedRepository,hashIngestionToken,verifyIngestionToken,runSignalSchema,computeCloudInsights} from '../src/managed_cloud_domain.js';
test('accepts scoped GitHub repository, branch, provider and consent',()=>{
 const input={name:'My service',repository:'https://github.com/acme/site',branch:'main',
  cloudRegion:'europe-west1',serviceName:'acme-service',monthlyBudgetUsd:30,
  autoDeploy:true,customerConsent:true};
 assert.equal(serviceSchema.parse(input).autoDeploy,true);
 assert.equal(normalizedRepository(input.repository).canonical,input.repository);
});
test('rejects dangerous repository and Git ref inputs',()=>{
 for(const repository of ['https://evil.example/repo','https://github.com/a/b?token=123','http://github.com/a/b','https://github.com/a/b/../../../x'])
  assert.throws(()=>normalizedRepository(repository));
 assert.throws(()=>serviceSchema.parse({name:'Safe',repository:'https://github.com/acme/repo',
  branch:'../main',cloudRegion:'europe-west1',serviceName:'good-service',monthlyBudgetUsd:10,
  autoDeploy:true,customerConsent:true}));
});
test('constant time token verification and no token recovery',()=>{
 const token='a'.repeat(64),digest=hashIngestionToken(token);
 assert.equal(verifyIngestionToken(token,digest),true);
 assert.equal(verifyIngestionToken('b'.repeat(64),digest),false);
 assert.equal(verifyIngestionToken('',digest),false);
});
test('rejects invalid result and unsafe metrics',()=>{
 assert.throws(()=>runSignalSchema.parse({runId:'1',sha:'x',branch:'main',status:'success'}));
 assert.throws(()=>runSignalSchema.parse({runId:'1',sha:'a'.repeat(40),
  branch:'main',status:'success',cpuPercent:130}));
});
test('returns explicitly attributed risk insights',()=>{
 const insight=computeCloudInsights([
  {status:'failure',durationSec:30},{status:'failure',durationSec:40},
  {status:'success',durationSec:50,errorRatePercent:7,estimatedMonthlyUsd:250}],100);
 assert.equal(insight.failureRatePercent,66.7);
 assert.ok(insight.alerts.some(a=>a.code==='budget'));
 assert.ok(insight.alerts.some(a=>a.code==='deploy_failures'));
 assert.equal(insight.provenance,'rule_based_on_reported_ci_and_telemetry');
});
