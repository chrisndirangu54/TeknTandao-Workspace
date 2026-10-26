import test from 'node:test';
import assert from 'node:assert/strict';
import {salesQuota,salesTerritory,quotaAttainment} from '../src/crm_quota_domain.js';
test('quota and territory require valid members and bounded values',()=>{
 assert.equal(salesQuota({ownerUid:'rep1',period:'2026-10',targetMinor:100000}).metric,'won_opportunity_value');
 assert.equal(salesTerritory({name:'Nairobi',ownerUid:'rep1'}).status,'active');
 assert.throws(()=>salesQuota({ownerUid:'rep1',period:'2026-13',targetMinor:10}),/quota/);
});
test('quota attainment counts only won deals closed in period',()=>{
 const q=[salesQuota({ownerUid:'rep1',period:'2026-10',targetMinor:100000})];
 const d=[{ownerUid:'rep1',stage:'won',amountMinor:50000,closedAt:'2026-10-20T10:00:00Z'},
 {ownerUid:'rep1',stage:'won',amountMinor:50000,closedAt:'2026-09-30T10:00:00Z'},
 {ownerUid:'rep1',stage:'proposal',amountMinor:100000}];
 const result=quotaAttainment(q,d,'2026-10');
 assert.equal(result[0].attainmentPercent,50);
 assert.equal(result[0].revenueRecognized,false);
});
