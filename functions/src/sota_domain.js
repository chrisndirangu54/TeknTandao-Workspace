import {identifier, money, optionalText, sanitizeRecord, textValue} from './domain.js';

export const graphNodeTypes = Object.freeze([
  'organization', 'customer', 'supplier', 'employee', 'member', 'product',
  'order', 'invoice', 'payment', 'asset', 'contract', 'project', 'property',
  'location', 'shipment', 'vehicle', 'site', 'sample', 'equipment', 'task', 'agent'
]);

const automationActionTypes = new Set(['createRecord', 'createTask', 'graphLink', 'emitEvent']);
const conditionOperators = new Set(['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'exists']);

function eventToken(value, label = 'event type') {
  if (typeof value !== 'string' || value.length > 100 || !/^[a-z0-9_-]+(?:\.[a-z0-9_-]+)+$/.test(value)) {
    throw new Error(`Invalid ${label}`);
  }
  return value;
}

function actionToken(value, label = 'action') {
  if (typeof value !== 'string' || value.length > 100 || !/^[a-zA-Z0-9_.:-]+$/.test(value)) {
    throw new Error(`Invalid ${label}`);
  }
  return value;
}

export function scalarMap(input, maxEntries = 30) {
  if (input == null) return {};
  if (typeof input !== 'object' || Array.isArray(input)) throw new Error('Expected object');
  const entries = Object.entries(input);
  if (entries.length > maxEntries) throw new Error('Too many fields');
  const result = {};
  for (const [rawKey, value] of entries) {
    const key = identifier(rawKey);
    if (value == null || typeof value === 'boolean') {
      result[key] = value;
    } else if (typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= 1e12) {
      result[key] = value;
    } else if (typeof value === 'string' && value.length <= 4000) {
      result[key] = value.trim();
    } else {
      throw new Error(`Unsupported field: ${key}`);
    }
  }
  return result;
}

export function validateGraphNode(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Invalid graph node');
  const type = String(input.type || '').toLowerCase();
  if (!graphNodeTypes.includes(type)) throw new Error('Invalid graph node type');
  return {
    type,
    entityId: identifier(input.entityId),
    label: textValue(input.label, 240),
    sourceApp: identifier(input.sourceApp),
    attributes: scalarMap(input.attributes, 20)
  };
}

export function validateGraphEdge(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Invalid graph edge');
  return {
    from: identifier(input.from),
    to: identifier(input.to),
    relation: actionToken(input.relation, 'graph relation').toLowerCase(),
    sourceApp: identifier(input.sourceApp),
    attributes: scalarMap(input.attributes, 12)
  };
}

export function graphNodeId(node) {
  return identifier(`${node.type}_${node.entityId}`);
}

export function validateBusinessEvent(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Invalid event');
  return {
    type: eventToken(input.type),
    sourceApp: identifier(input.sourceApp),
    payload: scalarMap(input.payload, 30),
    idempotencyKey: input.idempotencyKey ? identifier(input.idempotencyKey) : '',
    depth: Number.isInteger(input.depth) && input.depth >= 0 && input.depth <= 3 ? input.depth : 0
  };
}

function validateFieldMap(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Invalid field map');
  const entries = Object.entries(input);
  if (!entries.length || entries.length > 30) throw new Error('Invalid field map');
  const result = {};
  for (const [rawKey, value] of entries) {
    const key = identifier(rawKey);
    if (typeof value === 'string' && value.startsWith('$event.')) {
      const field = value.slice(7);
      if (!/^[a-zA-Z0-9_-]{1,100}$/.test(field)) throw new Error('Invalid event field reference');
      result[key] = value;
    } else if (value == null || typeof value === 'string' || typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value))) {
      result[key] = value;
    } else {
      throw new Error('Invalid field map value');
    }
  }
  return result;
}

export function validateAutomationRule(input, catalog) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Invalid automation rule');
  const conditions = Array.isArray(input.conditions) ? input.conditions : [];
  if (conditions.length > 10) throw new Error('Too many automation conditions');
  const cleanConditions = conditions.map(condition => {
    if (!condition || typeof condition !== 'object') throw new Error('Invalid automation condition');
    const operator = String(condition.operator || 'eq');
    if (!conditionOperators.has(operator)) throw new Error('Invalid condition operator');
    return {
      field: identifier(condition.field),
      operator,
      value: condition.value == null ? null : scalarMap({value: condition.value}, 1).value
    };
  });

  if (!Array.isArray(input.actions) || !input.actions.length || input.actions.length > 10) throw new Error('Automation requires actions');
  const actions = input.actions.map(action => {
    if (!action || typeof action !== 'object' || !automationActionTypes.has(action.type)) throw new Error('Invalid automation action');
    if (action.type === 'createRecord') {
      const targetApp = identifier(action.targetApp);
      if (!Object.hasOwn(catalog, targetApp)) throw new Error('Unknown target app');
      return {type: action.type, targetApp, fields: validateFieldMap(action.fields)};
    }
    if (action.type === 'createTask') {
      return {type: action.type, title: optionalText(action.title || 'Automation task', 240) || 'Automation task'};
    }
    if (action.type === 'graphLink') {
      return {
        type: action.type,
        fromField: identifier(action.fromField),
        toField: identifier(action.toField),
        relation: actionToken(action.relation, 'graph relation').toLowerCase()
      };
    }
    return {type: action.type, eventType: eventToken(action.eventType), fields: validateFieldMap(action.fields || {sourceEvent: '$event.type'})};
  });

  return {
    name: textValue(input.name, 160),
    enabled: input.enabled !== false,
    triggerEvent: eventToken(input.triggerEvent),
    conditions: cleanConditions,
    actions
  };
}

function eventField(event, field) {
  if (field === 'type') return event.type;
  if (field === 'sourceApp') return event.sourceApp;
  return event.payload?.[field];
}

export function eventMatchesRule(rule, event) {
  return rule.conditions.every(condition => {
    const actual = eventField(event, condition.field);
    const expected = condition.value;
    switch (condition.operator) {
      case 'eq': return actual === expected;
      case 'neq': return actual !== expected;
      case 'gt': return typeof actual === 'number' && typeof expected === 'number' && actual > expected;
      case 'gte': return typeof actual === 'number' && typeof expected === 'number' && actual >= expected;
      case 'lt': return typeof actual === 'number' && typeof expected === 'number' && actual < expected;
      case 'lte': return typeof actual === 'number' && typeof expected === 'number' && actual <= expected;
      case 'exists': return expected === false ? actual == null : actual != null;
      default: return false;
    }
  });
}

export function renderFieldMap(fields, event) {
  const result = {};
  for (const [key, value] of Object.entries(fields)) {
    if (typeof value === 'string' && value.startsWith('$event.')) {
      const field = value.slice(7);
      result[key] = field === 'type' ? event.type : field === 'sourceApp' ? event.sourceApp : event.payload?.[field] ?? null;
    } else {
      result[key] = value;
    }
  }
  return sanitizeRecord(result);
}

export function validateAgentPolicy(input, catalog) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Invalid agent policy');
  const allowedApps = [...new Set(Array.isArray(input.allowedApps) ? input.allowedApps.map(identifier) : [])];
  if (!allowedApps.length || allowedApps.length > 100 || allowedApps.some(app => !Object.hasOwn(catalog, app))) throw new Error('Invalid agent app scope');
  const allowedActions = [...new Set(Array.isArray(input.allowedActions) ? input.allowedActions.map(value => actionToken(value)) : [])];
  if (!allowedActions.length || allowedActions.length > 100) throw new Error('Invalid agent action scope');
  const approvalRequiredActions = [...new Set(Array.isArray(input.approvalRequiredActions) ? input.approvalRequiredActions.map(value => actionToken(value)) : [])];
  if (approvalRequiredActions.some(action => !allowedActions.includes(action))) throw new Error('Approval action must be allowed');
  return {
    active: input.active !== false,
    allowedApps,
    allowedActions,
    approvalRequiredActions,
    monthlyBudgetMinor: money(input.monthlyBudgetMinor ?? 0)
  };
}

export function evaluateAgentRequest(policy, request, spentMinor = 0) {
  const appId = identifier(request.appId);
  const action = actionToken(request.action);
  const estimatedCostMinor = money(request.estimatedCostMinor ?? 0);
  if (!policy?.active) return {allowed: false, reason: 'agent_disabled'};
  if (!policy.allowedApps.includes(appId)) return {allowed: false, reason: 'app_not_allowed'};
  if (!policy.allowedActions.includes(action)) return {allowed: false, reason: 'action_not_allowed'};
  if (spentMinor + estimatedCostMinor > policy.monthlyBudgetMinor) return {allowed: false, reason: 'budget_exceeded'};
  if (policy.approvalRequiredActions.includes(action)) return {allowed: false, approvalRequired: true, reason: 'approval_required'};
  return {allowed: true, approvalRequired: false, remainingBudgetMinor: policy.monthlyBudgetMinor - spentMinor - estimatedCostMinor};
}

export function validateOfflineOperation(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Invalid offline operation');
  if (!Number.isInteger(input.baseVersion) || input.baseVersion < 0 || input.baseVersion > 1e9) throw new Error('Invalid base version');
  return {
    mutationId: identifier(input.mutationId),
    recordId: identifier(input.recordId),
    baseVersion: input.baseVersion,
    record: sanitizeRecord(input.record)
  };
}

export function monthKey(date = new Date()) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) throw new Error('Invalid date');
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}
