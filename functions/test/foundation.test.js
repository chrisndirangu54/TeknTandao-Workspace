import {test} from 'node:test';
import assert from 'node:assert/strict';
import {foundationId,foundationPartyInput,foundationIdempotencyKey,
  foundationMembershipAllows,foundationEvent} from '../src/foundation_domain.js';

test('rejects path traversal and malformed organization IDs', () => {
  for (const id of ['../other','org/other','','bad space']) {
    assert.throws(() => foundationId(id));
  }
  assert.equal(foundationId('org_123'),'org_123');
});
test('rejects tenant ownership and privileged field injection', () => {
  assert.throws(() => foundationPartyInput({kind:'person',displayName:'A',tenantId:'another'}));
  assert.deepEqual(foundationPartyInput({kind:'organization',displayName:'  Example Ltd '}),
    {kind:'organization',displayName:'Example Ltd'});
});
test('denies missing and disabled memberships, restricts writes', () => {
  assert.equal(foundationMembershipAllows(null,'read'),false);
  assert.equal(foundationMembershipAllows({role:'owner',status:'disabled'},'read'),false);
  assert.equal(foundationMembershipAllows({role:'member'},'write'),false);
  assert.equal(foundationMembershipAllows({role:'owner'},'write'),true);
  assert.equal(foundationMembershipAllows({role:'member'},'read'),true);
});
test('enforces idempotency key shape', () => {
  assert.throws(() => foundationIdempotencyKey('x'));
  assert.throws(() => foundationIdempotencyKey('abc/def/ghi'));
  assert.equal(foundationIdempotencyKey('request_123'), 'request_123');
});
test('event envelope has tenant, version and no party PII', () => {
  const e=foundationEvent({id:'event',orgId:'tenant1',partyId:'party1',actorUid:'u1',occurredAt:'2026-11-03T00:00:00Z'});
  assert.equal(e.tenantId,'tenant1');
  assert.equal(e.eventVersion,1);
  assert.deepEqual(e.data,{partyId:'party1'});
});
