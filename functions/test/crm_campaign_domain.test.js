import test from 'node:test';
import assert from 'node:assert/strict';
import {crmCampaign,crmAttribution} from '../src/crm_campaign_domain.js';
test('campaigns validate a known acquisition source',()=>{
 assert.equal(crmCampaign({name:'School outreach',source:'email'}).attributionModel,'single_source');
 assert.throws(()=>crmCampaign({name:'x',source:'unknown'}),/Invalid/);
});
test('campaign attribution excludes unrelated opportunities',()=>{
 const report=crmAttribution([{campaignId:'a',stage:'won',amountMinor:40000},{campaignId:'a',stage:'lost',amountMinor:5000},{campaignId:'b',stage:'won',amountMinor:20000}], [{id:'a',name:'Campaign A',source:'email'}]);
 assert.equal(report[0].opportunities,2);assert.equal(report[0].wonOpportunityMinor,40000);assert.equal(report[0].closedWinRatePercent,50);
});
