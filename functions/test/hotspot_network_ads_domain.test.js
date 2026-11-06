import test from 'node:test';import assert from 'node:assert/strict';
import {splitTestBudget,allocatePreview,measurePilot,riskFlags} from '../src/hotspot_network_ads_domain.js';
const a={registryId:'r00001',orgId:'org_00001',siteId:'site_00001',category:'hostel',approved:true,ownerOptIn:true,gatewayVerified:true,labOnly:true,capacityDaily:50,activeUniqueDays:14,verifiedAvailabilityPct:100};
test('allocation includes only opted-in independently approved site evidence',()=>{
 const allocation=allocatePreview({sites:[a,{...a,registryId:'r00002',ownerOptIn:false}],budgetKes:1001});
 assert.equal(allocation.length,1);assert.equal(allocation[0].proposedKes,1001);
 assert.equal(allocation[0].earnedKes,0);
});
test('allocation preserves budget and is deterministic',()=>{
 const sites=[a,{...a,registryId:'r00002',siteId:'site_00002',capacityDaily:40}];
 const result=allocatePreview({sites,budgetKes:1001});
 assert.equal(result.reduce((n,s)=>n+s.proposedKes,0),1001);
 assert.deepEqual(result,allocatePreview({sites,budgetKes:1001}));
});
test('revenue split never promises payouts',()=>{
 const x=splitTestBudget(1001,7000);
 assert.equal(x.operatorIllustrativeKes,700);
 assert.equal(x.platformIllustrativeKes,301);
 assert.equal(x.payableKes,0);
});
test('measurement distinguishes network events from claimed sales',()=>{
 const x=measurePilot([{sessionsIssued:20,gatewayAccepts:14,verifiedRedemptions:3}]);
 assert.equal(x.admissionRate,0.7);assert.equal(x.incrementalLift,null);
 assert.deepEqual(riskFlags({sessionsIssued:30,gatewayAccepts:0,verifiedRedemptions:0}),['zero_gateway_admissions']);
});
