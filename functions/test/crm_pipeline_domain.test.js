import test from 'node:test';
import assert from 'node:assert/strict';
import {crmOpportunity,crmAdvanceOpportunity,crmFollowUp,crmPipelineSummary} from '../src/crm_pipeline_domain.js';
const input={title:'Annual services',contactId:'customer1',amountMinor:1200000,expectedCloseDate:'2026-11-20',probability:25};
test('opportunity validates money, close date and stages',()=>{
 const deal=crmOpportunity(input);
 assert.equal(deal.stage,'qualification');
 assert.throws(()=>crmOpportunity({...input,amountMinor:-1}),/Invalid/);
 assert.throws(()=>crmOpportunity({...input,expectedCloseDate:'2026-02-30'}),/close date/);
 assert.equal(crmAdvanceOpportunity(deal,'discovery').stage,'discovery');
 assert.throws(()=>crmAdvanceOpportunity(deal,'won'),/transition/);
});
test('lost deals require explanation and become terminal',()=>{
 const deal=crmOpportunity(input);
 const lost=crmAdvanceOpportunity(deal,'lost','Budget not approved');
 assert.equal(lost.probability,0);
 assert.equal(lost.status,'closed');
 assert.throws(()=>crmAdvanceOpportunity(lost,'discovery'),/transition/);
 assert.throws(()=>crmAdvanceOpportunity(deal,'lost',''),/Loss reason/);
});
test('follow-up requires assigned owner and valid time',()=>{
 assert.equal(crmFollowUp({title:'Check proposal',ownerUid:'rep1',dueAt:'2026-11-10T09:00:00Z'}).status,'open');
 assert.throws(()=>crmFollowUp({title:'Call',ownerUid:'rep1',dueAt:'bad'}),/follow-up/);
});
test('pipeline forecasts amounts without interpreting amounts as sales',()=>{
 const result=crmPipelineSummary([{...crmOpportunity(input),stage:'proposal'},crmOpportunity(input)]);
 assert.equal(result.proposal.weightedMinor,300000);
 assert.equal(result.qualification.count,1);
});
