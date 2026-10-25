import test from 'node:test';
import assert from 'node:assert/strict';
import {depreciationSchedule,depreciationJournal,planAssetDisposal,assetAcquisitionJournal} from '../src/fixed_assets_domain.js';
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

test('disposal recognizes gain or loss and produces balanced journals',()=>{
 const gain=planAssetDisposal({costMinor:10000,accumulatedMinor:4000,proceedsMinor:8000});
 assert.equal(gain.gainMinor,2000);
 assert.equal(gain.bookValueMinor,6000);
 assert.equal(trialBalance([gain.journal]).journalCount,1);
 const loss=planAssetDisposal({costMinor:10000,accumulatedMinor:0,proceedsMinor:5000});
 assert.equal(loss.lossMinor,5000);
 assert.equal(trialBalance([loss.journal]).journalCount,1);
});

test('asset acquisition records an asset and unreconciled clearing liability',()=>{
 const journal=assetAcquisitionJournal(125000);
 assert.equal(journal.lines.find(row=>row.account==='1500').debit,125000);
 assert.equal(journal.lines.find(row=>row.account==='2290').credit,125000);
 assert.equal(trialBalance([journal]).journalCount,1);
 assert.throws(()=>assetAcquisitionJournal(0),/positive/);
});
