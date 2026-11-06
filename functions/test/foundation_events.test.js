import {test} from 'node:test';
import assert from 'node:assert/strict';
import {foundationBranchInput,outboxBusinessEvent,foundationOutboxPath}
  from '../src/foundation_event_domain.js';
test('branch inputs cannot assert owner or tenant identifiers',()=>{
  assert.throws(()=>foundationBranchInput({name:'HQ',tenantId:'another'}));
  assert.throws(()=>foundationBranchInput({name:'HQ',createdBy:'admin'}));
  assert.deepEqual(foundationBranchInput({name:' HQ ',code:'HQ_1'}),{name:'HQ',code:'HQ_1'});
});
test('outbox path rejects cross-scope and path traversal',()=>{
  assert.throws(()=>foundationOutboxPath('../admin','event1'));
  assert.equal(foundationOutboxPath('tenant1','event1'),
    'organizations/tenant1/foundationOutbox/event1');
});
test('outbox delivery emits business event without sensitive party fields',()=>{
  const payload=outboxBusinessEvent({eventId:'evt1',tenantId:'tenant1',
    eventType:'enterprise.party.created',eventVersion:1,aggregateId:'p1',
    data:{partyId:'p1'},actorUid:'admin'});
  assert.equal(payload.type,'enterprise.party.created');
  assert.equal(payload.sourceApp,'crm');
  assert.deepEqual(payload.payload,{partyId:'p1'});
  assert.equal(payload.depth,0);
});
test('invalid versions and inconsistent aggregate refs are rejected',()=>{
  const good={eventId:'evt1',tenantId:'tenant1',eventType:'enterprise.party.created',
    eventVersion:1,aggregateId:'p1',data:{partyId:'p1'}};
  assert.throws(()=>outboxBusinessEvent({...good,eventVersion:2}));
  assert.throws(()=>outboxBusinessEvent({...good,data:{partyId:'p2'}}));
});
