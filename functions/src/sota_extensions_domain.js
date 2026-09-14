import {identifier, money, optionalText, sanitizeRecord, textValue} from './domain.js';
import {scalarMap, validateAutomationRule, validateBusinessEvent, validateGraphNode} from './sota_domain.js';
import {validateWebsiteDocument} from './website_builder_domain.js';
import {normalizeProductRecord, websiteBuilderAppId} from './website_business_ai_domain.js';

export const safeAgentExecutionActions = Object.freeze([
  'record.create',
  'record.update',
  'task.create',
  'event.publish',
  'graph.upsert',
  'website.document.apply',
  'website.publish'
]);

export const processTemplates = Object.freeze({
  retail_low_stock_replenishment: Object.freeze({
    id: 'retail_low_stock_replenishment',
    version: 1,
    name: 'Retail low-stock replenishment',
    category: 'Retail',
    description: 'Turn low-stock events into procurement requests without bypassing purchasing controls.',
    requiredApps: ['inventory', 'procurement'],
    rule: {
      name: 'Low stock → procurement request',
      enabled: true,
      triggerEvent: 'inventory.low_stock',
      conditions: [],
      actions: [{
        type: 'createRecord',
        targetApp: 'procurement',
        fields: {
          title: 'Automated replenishment request',
          item: '$event.item',
          quantity: '$event.reorderQuantity',
          vendor: '$event.vendor',
          status: 'DRAFT'
        }
      }]
    }
  }),
  property_maintenance_dispatch: Object.freeze({
    id: 'property_maintenance_dispatch',
    version: 1,
    name: 'Property maintenance dispatch',
    category: 'Property',
    description: 'Create a field-service job when a property maintenance request is raised.',
    requiredApps: ['property', 'fieldservice'],
    rule: {
      name: 'Maintenance request → field dispatch',
      enabled: true,
      triggerEvent: 'property.maintenance_requested',
      conditions: [],
      actions: [{
        type: 'createRecord',
        targetApp: 'fieldservice',
        fields: {
          title: 'Property maintenance dispatch',
          customer: '$event.tenant',
          location: '$event.property',
          notes: '$event.issue',
          status: 'NEW'
        }
      }]
    }
  }),
  logistics_delivery_followup: Object.freeze({
    id: 'logistics_delivery_followup',
    version: 1,
    name: 'Delivery customer follow-up',
    category: 'Logistics',
    description: 'Create a CRM follow-up task after a confirmed freight delivery.',
    requiredApps: ['freight', 'crm'],
    rule: {
      name: 'Delivery confirmed → CRM follow-up',
      enabled: true,
      triggerEvent: 'freight.delivery_confirmed',
      conditions: [],
      actions: [{type: 'createTask', title: 'Confirm delivery satisfaction and request feedback'}]
    }
  }),
  mining_sample_review: Object.freeze({
    id: 'mining_sample_review',
    version: 1,
    name: 'Mining sample intelligence review',
    category: 'Mining',
    description: 'Open an intelligence review record when a field sample is collected.',
    requiredApps: ['mc25_mining_operations', 'mc25_geo_and_mining_intelligence'],
    rule: {
      name: 'Sample collected → intelligence review',
      enabled: true,
      triggerEvent: 'mining.sample_collected',
      conditions: [],
      actions: [{
        type: 'createRecord',
        targetApp: 'mc25_geo_and_mining_intelligence',
        fields: {
          title: 'Review field sample',
          site: '$event.site',
          material: '$event.sampleId',
          location: '$event.location',
          notes: '$event.notes',
          status: 'REVIEW'
        }
      }]
    }
  }),
  ecommerce_customer_followup: Object.freeze({
    id: 'ecommerce_customer_followup',
    version: 1,
    name: 'E-commerce post-purchase follow-up',
    category: 'Retail',
    description: 'Create a CRM follow-up task after an online order is fulfilled.',
    requiredApps: ['ecommerce', 'crm'],
    rule: {
      name: 'Order fulfilled → CRM follow-up',
      enabled: true,
      triggerEvent: 'ecommerce.order_fulfilled',
      conditions: [],
      actions: [{type: 'createTask', title: 'Follow up after fulfilled online order'}]
    }
  })
});

export function validateProcessTemplate(template, catalog) {
  if (!template || typeof template !== 'object') throw new Error('Invalid process template');
  const requiredApps = [...new Set(template.requiredApps.map(identifier))];
  if (!requiredApps.length || requiredApps.some(app => !Object.hasOwn(catalog, app))) throw new Error('Invalid template app requirements');
  return {
    id: identifier(template.id),
    version: Number.isInteger(template.version) && template.version > 0 ? template.version : 1,
    name: textValue(template.name, 160),
    category: textValue(template.category, 80),
    description: optionalText(template.description, 600),
    requiredApps,
    rule: validateAutomationRule(template.rule, catalog)
  };
}

export function validateAiUsage(input, catalog) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Invalid AI usage');
  const provider = String(input.provider || '').trim().toLowerCase();
  if (!/^[a-z0-9_-]{2,40}$/.test(provider)) throw new Error('Invalid AI provider');
  const appId = identifier(input.appId);
  if (!Object.hasOwn(catalog, appId)) throw new Error('Unknown app');
  const integer = (value, label) => {
    if (!Number.isSafeInteger(value) || value < 0 || value > 1000000000) throw new Error(`Invalid ${label}`);
    return value;
  };
  return {
    requestId: identifier(input.requestId),
    provider,
    model: textValue(input.model, 160),
    appId,
    operation: optionalText(input.operation || 'inference', 160) || 'inference',
    inputTokens: integer(input.inputTokens ?? 0, 'input tokens'),
    outputTokens: integer(input.outputTokens ?? 0, 'output tokens'),
    cachedTokens: integer(input.cachedTokens ?? 0, 'cached tokens'),
    costMinor: money(input.costMinor ?? 0),
    metadata: scalarMap(input.metadata, 12)
  };
}

export function summarizeAiUsage(records, budgetMinor = 0) {
  const summary = {
    requests: 0,
    inputTokens: 0,
    outputTokens: 0,
    cachedTokens: 0,
    costMinor: 0,
    budgetMinor,
    remainingMinor: budgetMinor,
    percentUsed: 0,
    byProvider: {},
    byModel: {},
    byApp: {}
  };
  const bump = (bucket, key, cost) => {
    const current = bucket[key] || {requests: 0, costMinor: 0};
    bucket[key] = {requests: current.requests + 1, costMinor: current.costMinor + cost};
  };
  for (const record of records) {
    const cost = Number.isSafeInteger(record.costMinor) ? record.costMinor : 0;
    summary.requests += 1;
    summary.inputTokens += Number.isSafeInteger(record.inputTokens) ? record.inputTokens : 0;
    summary.outputTokens += Number.isSafeInteger(record.outputTokens) ? record.outputTokens : 0;
    summary.cachedTokens += Number.isSafeInteger(record.cachedTokens) ? record.cachedTokens : 0;
    summary.costMinor += cost;
    bump(summary.byProvider, String(record.provider || 'unknown'), cost);
    bump(summary.byModel, String(record.model || 'unknown'), cost);
    bump(summary.byApp, String(record.appId || 'unknown'), cost);
  }
  summary.remainingMinor = Math.max(0, budgetMinor - summary.costMinor);
  summary.percentUsed = budgetMinor > 0 ? Math.min(999, Math.round(summary.costMinor * 10000 / budgetMinor) / 100) : 0;
  return summary;
}

export function validateAgentExecution(input, appId) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Invalid agent execution');
  const action = String(input.action || '');
  if (!safeAgentExecutionActions.includes(action)) throw new Error('Agent action is not executable by the safe runtime');
  if (action === 'record.create') {
    const record = appId === 'inventory'
      ? normalizeProductRecord(input.payload?.record, {partial: false})
      : sanitizeRecord(input.payload?.record);
    return {
      action,
      payload: {
        record,
        recordId: input.payload?.recordId ? identifier(input.payload.recordId) : null,
      },
    };
  }
  if (action === 'record.update') {
    const recordId = identifier(input.payload?.recordId);
    const record = appId === 'inventory'
      ? normalizeProductRecord(input.payload?.record, {partial: true})
      : sanitizeRecord(input.payload?.record);
    return {action, payload: {recordId, record}};
  }
  if (action === 'task.create') {
    return {action, payload: {title: textValue(input.payload?.title || 'Agent task', 240)}};
  }
  if (action === 'event.publish') {
    const event = validateBusinessEvent({
      type: input.payload?.type,
      sourceApp: appId,
      payload: input.payload?.payload,
      idempotencyKey: input.payload?.idempotencyKey || ''
    });
    return {action, payload: {event}};
  }
  if (action === 'website.document.apply') {
    if (appId !== websiteBuilderAppId) throw new Error('Website document changes require a Website Builder permit');
    const expectedRevision = Number(input.payload?.expectedRevision);
    if (!Number.isInteger(expectedRevision) || expectedRevision < 1) throw new Error('Website document change requires expectedRevision');
    return {
      action,
      payload: {
        projectId: identifier(input.payload?.projectId),
        expectedRevision,
        document: validateWebsiteDocument(input.payload?.document),
        planId: input.payload?.planId ? identifier(input.payload.planId) : null,
      },
    };
  }
  if (action === 'website.publish') {
    if (appId !== websiteBuilderAppId) throw new Error('Website publishing requires a Website Builder permit');
    return {
      action,
      payload: {
        projectId: identifier(input.payload?.projectId),
        planId: input.payload?.planId ? identifier(input.payload.planId) : null,
      },
    };
  }
  if (action === 'graph.upsert') {
    const node = validateGraphNode({...input.payload?.node, sourceApp: appId});
    return {action, payload: {node}};
  }
  throw new Error('Unsupported safe agent action');
}

export function validateConflictResolution(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Invalid conflict resolution');
  const strategy = String(input.strategy || '');
  if (!['server_wins', 'apply_client_record'].includes(strategy)) throw new Error('Invalid conflict strategy');
  return {
    strategy,
    record: strategy === 'apply_client_record' ? sanitizeRecord(input.record) : null
  };
}
