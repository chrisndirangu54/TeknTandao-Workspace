import test from 'node:test';
import assert from 'node:assert/strict';
import {scoreCrmLead,rankCrmLeads} from '../src/crm_lead_scoring_domain.js';
const contact={id:'c1',email:'a@example.com',phone:'+254700123456',location:'Nairobi'};
const deal={id:'d1',contactId:'c1',stage:'proposal',status:'open'};
test('lead score is explainable and capped',()=>{
 const result=scoreCrmLead(contact,[deal],[{opportunityId:'d1',status:'open',dueAt:'2026-11-10T09:00:00Z'}]);
 assert.equal(result.score,85);
 assert.equal(result.band,'hot');
 assert.equal(result.predictive,false);
 assert.ok(result.reasons.some(r=>r.reason==='Advanced opportunity stage'));
});
test('overdue follow-up reduces score without going negative',()=>{
 const result=scoreCrmLead({id:'c1'},[deal],[{opportunityId:'d1',status:'open',dueAt:'2026-10-01T09:00:00Z'}]);
 assert.equal(result.score,35);
 assert.ok(result.reasons.some(r=>r.points===-10));
});
test('score ranking deterministic and bounded',()=>{
 const ranked=rankCrmLeads([{id:'c2'},contact],[deal],[],'2026-10-26T00:00:00Z');
 assert.equal(ranked[0].contactId,'c1');
 assert.throws(()=>scoreCrmLead({email:'x'}),/identifier/);
});
