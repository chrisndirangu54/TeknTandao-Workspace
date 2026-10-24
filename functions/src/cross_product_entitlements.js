'use strict';
// Deliberately pure: intended for reuse by existing verified-billing and ISP
// admin Functions, without touching routers or changing payment state.
const PRODUCTS = new Set(['TV','ISP','WORKSPACE']);
function normalizedSubscription(record, id) {
  if (!record || !PRODUCTS.has(record.product)) throw new Error('invalid_product');
  if (typeof record.customerId !== 'string' || !record.customerId) throw new Error('invalid_customer');
  return {
    subscriptionId:id, customerId:record.customerId, product:record.product,
    plan:record.plan ?? null, status:record.status ?? 'pending',
    startsAt:record.startsAt ?? null, endsAt:record.endsAt ?? null
  };
}
function eventEnvelope({eventId, subscriptionId, customerId, product, status, occurredAt}) {
  if (![eventId,subscriptionId,customerId].every(x=>typeof x==='string' && x.length>0)) throw new Error('missing_id');
  if (!PRODUCTS.has(product)) throw new Error('invalid_product');
  if (!['pending','active','trialing','paused','expired','cancelled'].includes(status)) throw new Error('invalid_state');
  const when = new Date(occurredAt);
  if (!Number.isFinite(when.getTime())) throw new Error('invalid_time');
  return {type:'subscription.status.changed.v1',eventId,subscriptionId,customerId,product,newStatus:status,occurredAt:when.toISOString()};
}
module.exports={normalizedSubscription,eventEnvelope};
