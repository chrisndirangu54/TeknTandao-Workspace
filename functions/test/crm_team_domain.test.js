import test from 'node:test';
import assert from 'node:assert/strict';
import {assignDealOwner,crmTeamPerformance} from '../src/crm_team_domain.js';
test('deal assignment requires a valid owner and justification',()=>{
 assert.equal(assignDealOwner({stage:'proposal'},'rep1','Territory reassignment').ownerUid,'rep1');
 assert.throws(()=>assignDealOwner({stage:'won'},'rep1','Reason'),/Open/);
 assert.throws(()=>assignDealOwner({stage:'proposal'},'rep1',''),/reason/);
});
test('team report separates open opportunity value from won value',()=>{
 const report=crmTeamPerformance([
  {ownerUid:'rep1',stage:'won',amountMinor:12000},
  {ownerUid:'rep1',stage:'lost',amountMinor:5000},
  {ownerUid:'rep1',stage:'proposal',amountMinor:30000},
  {ownerUid:'rep2',stage:'qualification',amountMinor:1000},
 ]);
 const rep1=report.find(r=>r.ownerUid==='rep1');
 assert.equal(rep1.winRatePercent,50);
 assert.equal(rep1.wonValueMinor,12000);
 assert.equal(rep1.openValueMinor,30000);
});
