import test from 'node:test';
import assert from 'node:assert/strict';
import {crmConversionReport} from '../src/crm_conversion_domain.js';
test('won and lost deals count only in closing period',()=>{
 const rows=[{stage:'won',closedAt:'2026-10-22T09:00:00Z',amountMinor:10000},
 {stage:'lost',closedAt:'2026-10-23T09:00:00Z',closedReason:'Budget'},
 {stage:'won',closedAt:'2026-09-23T09:00:00Z',amountMinor:20000},
 {stage:'proposal',amountMinor:30000}];
 const r=crmConversionReport(rows,'2026-10');
 assert.equal(r.closedWinRatePercent,50);assert.equal(r.wonValueMinor,10000);
 assert.equal(r.lossReasons[0].reason,'Budget');
});
test('no closed deals produces undefined win rate',()=>{
 assert.equal(crmConversionReport([],'2026-10').closedWinRatePercent,null);
 assert.throws(()=>crmConversionReport([],'2026-13'),/Invalid/);
});
