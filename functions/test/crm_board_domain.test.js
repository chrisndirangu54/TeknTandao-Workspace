import test from 'node:test';
import assert from 'node:assert/strict';
import {crmBoardMetrics} from '../src/crm_board_domain.js';
test('sales board counts deals, weighted amounts and closed win rate',()=>{
 const deals=[{stage:'proposal',amountMinor:10000,probability:50},{stage:'won',amountMinor:20000,probability:100},{stage:'lost',amountMinor:5000,probability:0}];
 const result=crmBoardMetrics(deals,[{status:'open',dueAt:'2026-10-01T00:00:00Z'}],'2026-10-26T00:00:00Z');
 assert.equal(result.openDeals,1);assert.equal(result.winRateClosedPercent,50);
 assert.equal(result.overdueFollowUps,1);
 assert.equal(result.columns.find(c=>c.stage==='proposal').weightedMinor,5000);
});
test('win rate is absent when no deals have closed',()=>{
 assert.equal(crmBoardMetrics([],[],'2026-10-26T00:00:00Z').winRateClosedPercent,null);
 assert.throws(()=>crmBoardMetrics([],[],'bad'),/reporting date/);
});
