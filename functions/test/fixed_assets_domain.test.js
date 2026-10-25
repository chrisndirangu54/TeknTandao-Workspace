import test from 'node:test';
import assert from 'node:assert/strict';
import {depreciationSchedule,depreciationJournal} from '../src/fixed_assets_domain.js';
import {trialBalance} from '../src/ledger_domain.js';
test('straight line schedule allocates exact depreciable cost',()=>{
 const rows=depreciationSchedule({assetId:'laptop',costMinor:12001,residualMinor:1,lifeMonths:7,startMonth:'2026-10'});
 assert.equal(rows.reduce((s,r)=>s+r.expenseMinor,0),12000);
 assert.equal(rows[0].period,'2026-10');
 assert.equal(rows.at(-1).period,'2027-04');
 assert.equal(trialBalance([depreciationJournal(rows[0].expenseMinor)]).journalCount,1);
});
test('rejects invalid lives and residuals',()=>{
 assert.throws(()=>depreciationSchedule({assetId:'a',costMinor:10,residualMinor:10,lifeMonths:1,startMonth:'2026-01'}));
 assert.throws(()=>depreciationSchedule({assetId:'a',costMinor:10,lifeMonths:0,startMonth:'2026-01'}));
});
