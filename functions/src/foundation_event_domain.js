// Firestore-native Phase 1 outbox and branch contracts, no network dependencies.
import {foundationId} from './foundation_domain.js';
export function foundationBranchInput(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      Object.keys(value).some(k => !['name','code'].includes(k))) throw new Error('Invalid branch');
  if (typeof value.name !== 'string' || !value.name.trim() || value.name.length > 120)
    throw new Error('Invalid branch name');
  if (value.code !== undefined) foundationId(value.code,'branch code');
  return {name:value.name.trim(),...(value.code===undefined?{}:{code:value.code})};
}
export function outboxBusinessEvent(event) {
  if (!event || event.eventType !== 'enterprise.party.created' || event.eventVersion !== 1)
    throw new Error('Unsupported foundation event');
  foundationId(event.tenantId,'event tenant');
  foundationId(event.eventId,'event ID');
  foundationId(event.aggregateId,'aggregate ID');
  if (event.data?.partyId !== event.aggregateId) throw new Error('Invalid event aggregate');
  return {
    type:event.eventType,sourceApp:'crm',
    payload:{partyId:event.aggregateId},depth:0,
    state:'pending',actorUid:event.actorUid,
    foundationEventId:event.eventId,foundationEventVersion:1
  };
}
export function foundationOutboxPath(orgId,eventId) {
  return `organizations/${foundationId(orgId,'organization')}/foundationOutbox/${foundationId(eventId,'event ID')}`;
}
