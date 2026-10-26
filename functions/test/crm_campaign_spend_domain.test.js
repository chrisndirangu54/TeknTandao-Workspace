import test from 'node:test';
import assert from 'node:assert/strict';
import {campaignSpend,campaignEfficiency} from '../src/crm_campaign_spend_domain.js';
test('campaign spend requires positive minor currency units and valid date',()=>{
 assert.equal(campaignSpend({amountMinor:10000,occurredOn:'2026-10-26'}).currency,'KES');
 assert.throws(()=>campaignSpend({amountMinor:-1,occurredOn:'2026-10-26'}),/Valid/);
 assert.throws(()=>campaignSpend({amountMinor:1,occurredOn:'2026-02-30'}),/Valid/);
});
test('efficiency never confuses opportunity value with financial return',()=>{
 const r=campaignEfficiency([{id:'a',name:'Email',source:'email'}],
 [{campaignId:'a',stage:'won',amountMinor:100000},{campaignId:'a',stage:'proposal',amountMinor:20000}],
 [{campaignId:'a',amountMinor:10000}])[0];
 assert.equal(r.spendPerOpportunityMinor,5000);
 assert.equal(r.spendPerWonDealMinor,10000);
 assert.equal(r.returnOnSpend,null);
 assert.equal(r.recognizedRevenue,false);
});
