import test from 'node:test';
import assert from 'node:assert/strict';
import {crmSalesRecommendations} from '../src/crm_sales_agent_domain.js';
const now='2026-10-26T12:00:00Z';
const opportunities=[
 {id:'stalled',title:'Hospital ERP',contactId:'c1',stage:'proposal',status:'open',ownerUid:'u1',amountMinor:900000,expectedCloseDate:'2026-10-20',stageEnteredAt:'2026-09-20T00:00:00Z'},
 {id:'won',title:'Won',stage:'won',status:'closed'},
 {id:'fresh',title:'New',stage:'qualification',status:'open',expectedCloseDate:'2026-12-01',stageEnteredAt:'2026-10-25T00:00:00Z'}
];
test('flags overdue stalled deal with explicit recommendation and owner',()=>{
 const r=crmSalesRecommendations(opportunities,[{id:'f1',opportunityId:'stalled',status:'open',dueAt:'2026-10-01T00:00:00Z'}],now);
 assert.equal(r.recommendations[0].opportunityId,'stalled');
 assert.equal(r.recommendations[0].ownerUid,'u1');
 assert.ok(r.recommendations[0].reasons.includes('overdue_follow_up'));
 assert.ok(r.recommendations[0].reasons.includes('stage_stalled'));
 assert.equal(r.readOnly,true);
});
test('never recommends closed deals and flags opportunities without next actions',()=>{
 const r=crmSalesRecommendations(opportunities,[],now);
 assert.ok(!r.recommendations.some(x=>x.opportunityId==='won'));
 assert.ok(r.recommendations.some(x=>x.opportunityId==='fresh'&&x.reasons.includes('no_open_follow_up')));
});
test('fails closed for oversized snapshots and invalid limits',()=>{
 assert.throws(()=>crmSalesRecommendations(Array(501).fill({id:'a'}),[],now));
 assert.throws(()=>crmSalesRecommendations([],[],now,101));
});
