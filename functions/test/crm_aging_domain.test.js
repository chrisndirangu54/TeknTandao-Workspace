import test from 'node:test';
import assert from 'node:assert/strict';
import {crmAgingReport} from '../src/crm_aging_domain.js';
test('stalled opportunities identified from stage entry',()=>{
 const r=crmAgingReport([{id:'a',stage:'proposal',stageEnteredAt:'2026-10-01T00:00:00Z'},
 {id:'b',stage:'qualification',stageEnteredAt:'2026-10-24T00:00:00Z'},
 {id:'c',stage:'won',stageEnteredAt:'2026-09-01T00:00:00Z'}],'2026-10-26T00:00:00Z',14);
 assert.equal(r.openDeals,2);assert.equal(r.stalledDeals,1);assert.equal(r.rows[0].stageDays,25);
});
test('unknown timestamps stay unknown rather than estimated',()=>{
 const r=crmAgingReport([{id:'legacy',stage:'discovery'}],'2026-10-26T00:00:00Z');
 assert.equal(r.unknownAgeDeals,1);assert.equal(r.rows[0].stalled,null);
 assert.throws(()=>crmAgingReport([],'bad'),/Invalid/);
});

test('legacy deal uses creation timestamp when stage entry is missing',()=>{
 const r=crmAgingReport([{id:'old',stage:'proposal',createdAt:{seconds:1790812800}}],'2026-10-26T00:00:00Z',14);
 assert.equal(r.unknownAgeDeals,0);
 assert.equal(r.stalledDeals,1);
});
