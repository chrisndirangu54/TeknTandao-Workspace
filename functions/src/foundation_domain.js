// Firebase-native Phase 1 foundation contracts. Pure validation helpers.
export const FOUNDATION_EVENT_VERSION = 1;
const idPattern = /^[A-Za-z0-9_-]{1,100}$/;
const displayNamePattern = /\S/;
export function foundationId(value, label = 'identifier') {
  if (typeof value !== 'string' || !idPattern.test(value)) throw new Error(`Invalid ${label}`);
  return value;
}
export function foundationPartyInput(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid party');
  const allowed = ['kind', 'displayName', 'externalRef'];
  if (Object.keys(value).some(k => !allowed.includes(k))) throw new Error('Unexpected party field');
  if (!['person','organization'].includes(value.kind)) throw new Error('Invalid party kind');
  if (typeof value.displayName !== 'string' || !displayNamePattern.test(value.displayName) || value.displayName.length > 160) throw new Error('Invalid display name');
  const out = {kind: value.kind, displayName: value.displayName.trim()};
  if (value.externalRef !== undefined) out.externalRef = foundationId(value.externalRef, 'external reference');
  return out;
}
export function foundationIdempotencyKey(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{8,100}$/.test(value)) throw new Error('Invalid idempotency key');
  return value;
}
export function foundationMembershipAllows(member, operation) {
  if (!member || member.status === 'disabled') return false;
  if (!['owner','admin','member'].includes(member.role)) return false;
  return operation === 'read' || ['owner','admin'].includes(member.role);
}
export function foundationEvent({id, orgId, partyId, actorUid, occurredAt}) {
  return {eventId: id, tenantId: orgId, aggregateType:'party', aggregateId:partyId,
    eventType:'enterprise.party.created', eventVersion:FOUNDATION_EVENT_VERSION,
    actorUid, occurredAt, data:{partyId}};
}
