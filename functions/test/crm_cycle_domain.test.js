import test from 'node:test';
import assert from 'node:assert/strict';
import {crmSalesCycleReport} from '../src/crm_cycle_domain.js';
test('closed sales cycles and observed transitions are counted',()=>{
 const deals=[{id:'a',stage:'won',createdAt:'2026-10-01T00:00:00Z',closedAt:'2026-10-11T00:00:00Z'}];
 const r=crmSalesCycleReport(deals,{a:[{from:'qualification',to:'discovery'},{from:'discovery',to:'proposal'},{from:'proposal',to:'won'}]},'2026-10');
 assert.equal(r.averageDaysToClose,10);
 assert.equal(r.transitions.proposal.won,1);
 assert.equal(r.closedDeals,1);
});
test('missing history is explicitly incomplete',()=>{
 const r=crmSalesCycleReport([{id:'old',stage:'lost',closedAt:'2026-10-11T00:00:00Z'}],{},'2026-10');
 assert.equal(r.averageDaysToClose,null);
 assert.ok(r.unknownEvidenceCount>0);
});
