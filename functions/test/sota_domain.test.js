import test from 'node:test';
import assert from 'node:assert/strict';
import {catalog} from '../src/domain.js';
import {
  evaluateAgentRequest,
  eventMatchesRule,
  graphNodeId,
  renderFieldMap,
  validateAgentPolicy,
  validateAutomationRule,
  validateBusinessEvent,
  validateGraphEdge,
  validateGraphNode,
  validateOfflineOperation
} from '../src/sota_domain.js';
import {getVerticalPack, verticalPacks} from '../src/vertical_packs.js';

test('business graph validates typed nodes and edges', () => {
  const node = validateGraphNode({
    type: 'customer',
    entityId: 'cust_42',
    label: 'Acme Retail',
    sourceApp: 'crm',
    attributes: {county: 'Nairobi', lifetimeValue: 250000}
  });
  assert.equal(graphNodeId(node), 'customer_cust_42');
  assert.deepEqual(validateGraphEdge({
    from: 'customer_cust_42',
    to: 'order_order_9',
    relation: 'placed',
    sourceApp: 'crm',
    attributes: {channel: 'whatsapp'}
  }).relation, 'placed');
  assert.throws(() => validateGraphNode({type: 'unknown', entityId: 'x', label: 'X', sourceApp: 'crm'}));
  assert.throws(() => validateGraphEdge({from: '../a', to: 'b', relation: 'owns', sourceApp: 'crm'}));
});

test('business events are bounded and idempotency-safe', () => {
  assert.deepEqual(validateBusinessEvent({
    type: 'sale.completed',
    sourceApp: 'pos',
    payload: {saleId: 'sale_1', amount: 45000},
    idempotencyKey: 'checkout_1'
  }), {
    type: 'sale.completed',
    sourceApp: 'pos',
    payload: {saleId: 'sale_1', amount: 45000},
    idempotencyKey: 'checkout_1',
    depth: 0
  });
  assert.throws(() => validateBusinessEvent({type: 'bad event', sourceApp: 'crm'}));
  assert.throws(() => validateBusinessEvent({type: 'crm.created', sourceApp: 'crm', payload: {nested: {bad: true}}}));
});

test('automation rules support safe conditions, field mapping and cross-app actions', () => {
  const rule = validateAutomationRule({
    name: 'High value sale follow-up',
    triggerEvent: 'sale.completed',
    conditions: [{field: 'amount', operator: 'gte', value: 100000}],
    actions: [
      {type: 'createTask', title: 'Call high-value customer'},
      {type: 'createRecord', targetApp: 'crm', fields: {title: 'VIP follow-up', saleRef: '$event.saleId'}},
      {type: 'emitEvent', eventType: 'customer.vip_detected', fields: {customerId: '$event.customerId'}}
    ]
  }, catalog);
  const event = {type: 'sale.completed', sourceApp: 'pos', payload: {saleId: 'sale_9', customerId: 'cust_9', amount: 120000}};
  assert.equal(eventMatchesRule(rule, event), true);
  assert.deepEqual(renderFieldMap(rule.actions[1].fields, event), {
    title: 'VIP follow-up',
    saleRef: 'sale_9',
    name: 'VIP follow-up'
  });
  assert.equal(eventMatchesRule(rule, {...event, payload: {...event.payload, amount: 90000}}), false);
  assert.throws(() => validateAutomationRule({name: 'Bad', triggerEvent: 'sale.completed', actions: [{type: 'shell'}]}, catalog));
});

test('agent governance enforces app scope, actions, approvals and budgets', () => {
  const policy = validateAgentPolicy({
    allowedApps: ['crm', 'accounting'],
    allowedActions: ['crm.read', 'invoice.create'],
    approvalRequiredActions: ['invoice.create'],
    monthlyBudgetMinor: 100000,
    active: true
  }, catalog);
  assert.deepEqual(evaluateAgentRequest(policy, {appId: 'crm', action: 'crm.read', estimatedCostMinor: 5000}, 10000), {
    allowed: true,
    approvalRequired: false,
    remainingBudgetMinor: 85000
  });
  assert.equal(evaluateAgentRequest(policy, {appId: 'accounting', action: 'invoice.create', estimatedCostMinor: 5000}, 10000).approvalRequired, true);
  assert.equal(evaluateAgentRequest(policy, {appId: 'crm', action: 'crm.read', estimatedCostMinor: 95000}, 10000).reason, 'budget_exceeded');
  assert.equal(evaluateAgentRequest(policy, {appId: 'inventory', action: 'crm.read', estimatedCostMinor: 0}, 0).reason, 'app_not_allowed');
});

test('offline operations require optimistic versions and scalar records', () => {
  assert.deepEqual(validateOfflineOperation({
    mutationId: 'phone_17',
    recordId: 'customer_12',
    baseVersion: 3,
    record: {title: 'Updated customer', county: 'Nairobi'}
  }), {
    mutationId: 'phone_17',
    recordId: 'customer_12',
    baseVersion: 3,
    record: {title: 'Updated customer', county: 'Nairobi', name: 'Updated customer'}
  });
  assert.throws(() => validateOfflineOperation({mutationId: 'x', recordId: 'y', baseVersion: -1, record: {title: 'bad'}}));
});

test('five deep vertical operating packs are available', () => {
  assert.deepEqual(Object.keys(verticalPacks).sort(), ['logistics', 'mining', 'property', 'retail', 'sacco']);
  assert.equal(getVerticalPack('mining').offlineCritical, true);
  assert.ok(getVerticalPack('retail').primaryApps.includes('pos'));
  assert.ok(getVerticalPack('sacco').events.includes('loan.delinquent'));
  assert.throws(() => getVerticalPack('unknown'));
});
