import test from 'node:test';
import assert from 'node:assert/strict';
import {catalog} from '../src/domain.js';
import {
  processTemplates,
  safeAgentExecutionActions,
  summarizeAiUsage,
  validateAgentExecution,
  validateAiUsage,
  validateConflictResolution,
  validateProcessTemplate
} from '../src/sota_extensions_domain.js';

test('process marketplace templates are installable automation contracts', () => {
  const templates = Object.values(processTemplates).map(template => validateProcessTemplate(template, catalog));
  assert.equal(templates.length, 5);
  assert.deepEqual(new Set(templates.map(template => template.id)).size, 5);
  assert.ok(templates.some(template => template.id === 'retail_low_stock_replenishment'));
  assert.ok(templates.some(template => template.id === 'mining_sample_review'));
  for (const template of templates) {
    assert.ok(template.requiredApps.length >= 2);
    assert.ok(template.rule.actions.length >= 1);
  }
});

test('AI FinOps validates provider usage and summarizes spend', () => {
  const first = validateAiUsage({
    requestId: 'req_1', provider: 'openai', model: 'gpt-5.6-sol', appId: 'analytics',
    operation: 'report', inputTokens: 1000, outputTokens: 200, cachedTokens: 100, costMinor: 25,
    metadata: {region: 'africa'}
  }, catalog);
  const second = validateAiUsage({
    requestId: 'req_2', provider: 'google', model: 'gemini', appId: 'analytics',
    inputTokens: 500, outputTokens: 100, cachedTokens: 0, costMinor: 15
  }, catalog);
  const summary = summarizeAiUsage([first, second], 100);
  assert.equal(summary.requests, 2);
  assert.equal(summary.costMinor, 40);
  assert.equal(summary.remainingMinor, 60);
  assert.equal(summary.percentUsed, 40);
  assert.equal(summary.byProvider.openai.costMinor, 25);
  assert.equal(summary.byApp.analytics.requests, 2);
  assert.throws(() => validateAiUsage({requestId: 'bad', provider: '!', model: 'x', appId: 'analytics'}, catalog));
});

test('safe agent runtime exposes only non-regulated execution actions', () => {
  assert.deepEqual(safeAgentExecutionActions, ['record.create', 'task.create', 'event.publish', 'graph.upsert']);
  const create = validateAgentExecution({
    action: 'record.create', payload: {record: {title: 'Follow up', status: 'OPEN'}}
  }, 'crm');
  assert.equal(create.action, 'record.create');
  const event = validateAgentExecution({
    action: 'event.publish', payload: {type: 'crm.followup_requested', payload: {customerId: 'c_1'}}
  }, 'crm');
  assert.equal(event.payload.event.sourceApp, 'crm');
  assert.throws(() => validateAgentExecution({action: 'payment.send', payload: {}}, 'payments'));
  assert.throws(() => validateAgentExecution({action: 'tax.file', payload: {}}, 'etims'));
});

test('sync conflict resolution requires an explicit safe strategy', () => {
  assert.equal(validateConflictResolution({strategy: 'server_wins'}).strategy, 'server_wins');
  const client = validateConflictResolution({strategy: 'apply_client_record', record: {title: 'Field edit', status: 'ACTIVE'}});
  assert.equal(client.record.title, 'Field edit');
  assert.throws(() => validateConflictResolution({strategy: 'overwrite_silently'}));
});
