import './index.js';
import {createHash, randomUUID} from 'node:crypto';
import {FieldValue, Timestamp, getFirestore} from 'firebase-admin/firestore';
import {HttpsError, onCall} from 'firebase-functions/v2/https';
import {onDocumentCreated} from 'firebase-functions/v2/firestore';
import {catalog, canAccess, identifier, textValue} from './domain.js';
import {
  evaluateAgentRequest,
  eventMatchesRule,
  graphNodeId,
  monthKey,
  renderFieldMap,
  validateAgentPolicy,
  validateAutomationRule,
  validateBusinessEvent,
  validateGraphEdge,
  validateGraphNode,
  validateOfflineOperation
} from './sota_domain.js';
import {verticalPacks} from './vertical_packs.js';

const db = getFirestore();
const region = 'europe-west1';
const stamp = () => FieldValue.serverTimestamp();
const root = org => db.doc(`organizations/${identifier(org)}`);

const topLevelCollectionByApp = Object.freeze({
  crm: 'contacts', inventory: 'products', hr: 'employees', projects: 'projects',
  helpdesk: 'tickets', hospital: 'patients', school: 'students', property: 'properties',
  sacco: 'sacco_members', marketing: 'marketing_campaigns', bookings: 'appointments',
  ecommerce: 'ecommerce_orders', procurement: 'procurement_pos', manufacturing: 'work_orders',
  fieldservice: 'field_dispatches', fleet: 'fleet_trips', hotel: 'hotel_rooms',
  restaurant: 'restaurant_orders', ngo: 'grants', documents: 'documents'
});
const dedicatedWorkflowApps = new Set(['pos', 'accounting', 'payments', 'etims']);

function uid(request) {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in first');
  return request.auth.uid;
}

async function authorize(request, app = null, ownerOnly = false) {
  const user = uid(request);
  const org = root(request.data.orgId);
  const member = (await org.collection('members').doc(user).get()).data();
  if (!member || (ownerOnly && member.role !== 'owner')) throw new HttpsError('permission-denied', 'Organization access denied');
  if (app) {
    if (!Object.hasOwn(catalog, app)) throw new Error('Unknown app');
    const installation = (await org.collection('apps').doc(app).get()).data();
    if (!canAccess(member, app, installation)) throw new HttpsError('permission-denied', 'App subscription or permission required');
  }
  return {org, user, member};
}

function callable(handler) {
  return onCall({region}, async request => {
    try {
      return await handler(request);
    } catch (error) {
      if (error instanceof HttpsError) throw error;
      throw new HttpsError('failed-precondition', error?.message || 'Operation failed');
    }
  });
}

function recordCollection(org, app) {
  if (dedicatedWorkflowApps.has(app)) throw new Error(`Use the dedicated ${app} workflow`);
  return org.collection(topLevelCollectionByApp[app] || app);
}

async function appIsActive(org, app) {
  if (!Object.hasOwn(catalog, app)) return false;
  const installation = (await org.collection('apps').doc(app).get()).data();
  return installation?.expiresAt?.toMillis?.() > Date.now();
}

function edgeId(edge) {
  return createHash('sha256').update(`${edge.from}|${edge.relation}|${edge.to}`).digest('hex').slice(0, 40);
}

export const upsertBusinessGraphNode = callable(async request => {
  const node = validateGraphNode(request.data.node);
  const {org, user} = await authorize(request, node.sourceApp);
  const id = graphNodeId(node);
  await org.collection('businessGraphNodes').doc(id).set({
    ...node,
    nodeId: id,
    updatedBy: user,
    updatedAt: stamp()
  }, {merge: true});
  return {nodeId: id};
});

export const linkBusinessGraphNodes = callable(async request => {
  const edge = validateGraphEdge(request.data.edge);
  const {org, user} = await authorize(request, edge.sourceApp);
  const [from, to] = await Promise.all([
    org.collection('businessGraphNodes').doc(edge.from).get(),
    org.collection('businessGraphNodes').doc(edge.to).get()
  ]);
  if (!from.exists || !to.exists) throw new Error('Both graph nodes must exist');
  const id = edgeId(edge);
  await org.collection('businessGraphEdges').doc(id).set({
    ...edge,
    edgeId: id,
    updatedBy: user,
    updatedAt: stamp()
  }, {merge: true});
  return {edgeId: id};
});

export const queryBusinessGraph = callable(async request => {
  const {org} = await authorize(request, null, true);
  const nodeId = identifier(request.data.nodeId);
  const node = await org.collection('businessGraphNodes').doc(nodeId).get();
  if (!node.exists) throw new Error('Graph node not found');
  const [outgoing, incoming] = await Promise.all([
    org.collection('businessGraphEdges').where('from', '==', nodeId).limit(25).get(),
    org.collection('businessGraphEdges').where('to', '==', nodeId).limit(25).get()
  ]);
  const edges = [...outgoing.docs, ...incoming.docs].map(doc => doc.data());
  const neighborIds = [...new Set(edges.map(edge => edge.from === nodeId ? edge.to : edge.from))].slice(0, 50);
  const neighbors = neighborIds.length
    ? await Promise.all(neighborIds.map(id => org.collection('businessGraphNodes').doc(id).get()))
    : [];
  return {
    node: node.data(),
    edges,
    neighbors: neighbors.filter(snapshot => snapshot.exists).map(snapshot => snapshot.data())
  };
});

export const publishBusinessEvent = callable(async request => {
  const event = validateBusinessEvent(request.data.event);
  const {org, user} = await authorize(request, event.sourceApp);
  const id = event.idempotencyKey ? `evt_${event.sourceApp}_${event.idempotencyKey}` : randomUUID();
  const ref = org.collection('eventBus').doc(id);
  try {
    await ref.create({
      ...event,
      state: 'pending',
      actorUid: user,
      createdAt: stamp()
    });
    return {eventId: id, duplicate: false};
  } catch (error) {
    if (event.idempotencyKey && error?.code === 6) return {eventId: id, duplicate: true};
    if (event.idempotencyKey && String(error?.message || '').toLowerCase().includes('already exists')) return {eventId: id, duplicate: true};
    throw error;
  }
});

export const saveAutomationRule = callable(async request => {
  const {org, user} = await authorize(request, null, true);
  const rule = validateAutomationRule(request.data.rule, catalog);
  for (const action of rule.actions) {
    if (action.targetApp && dedicatedWorkflowApps.has(action.targetApp)) {
      throw new Error(`Automation cannot bypass the dedicated ${action.targetApp} workflow`);
    }
  }
  const id = identifier(request.data.ruleId || randomUUID());
  await org.collection('automationRules').doc(id).set({
    ...rule,
    ruleId: id,
    updatedBy: user,
    updatedAt: stamp()
  }, {merge: true});
  return {ruleId: id};
});

async function executeAutomationAction({org, eventId, businessEvent, ruleId, action, index}) {
  if (action.type === 'createRecord') {
    if (!await appIsActive(org, action.targetApp)) return {type: action.type, skipped: 'target_app_inactive'};
    const data = renderFieldMap(action.fields, businessEvent);
    const id = `auto_${eventId}_${ruleId}_${index}`.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 180);
    await recordCollection(org, action.targetApp).doc(id).set({
      ...data,
      automationRuleId: ruleId,
      sourceEventId: eventId,
      createdAt: stamp()
    }, {merge: true});
    return {type: action.type, targetApp: action.targetApp, recordId: id};
  }
  if (action.type === 'createTask') {
    if (!await appIsActive(org, 'crm')) return {type: action.type, skipped: 'crm_inactive'};
    const id = `auto_${eventId}_${ruleId}_${index}`.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 180);
    await org.collection('tasks').doc(id).set({
      name: action.title,
      status: 'open',
      sourceEventId: eventId,
      automationRuleId: ruleId,
      createdAt: stamp()
    }, {merge: true});
    return {type: action.type, taskId: id};
  }
  if (action.type === 'graphLink') {
    const from = businessEvent.payload?.[action.fromField];
    const to = businessEvent.payload?.[action.toField];
    if (typeof from !== 'string' || typeof to !== 'string') return {type: action.type, skipped: 'missing_node_ids'};
    const edge = validateGraphEdge({from, to, relation: action.relation, sourceApp: businessEvent.sourceApp});
    const id = edgeId(edge);
    await org.collection('businessGraphEdges').doc(id).set({
      ...edge,
      edgeId: id,
      automationRuleId: ruleId,
      sourceEventId: eventId,
      updatedAt: stamp()
    }, {merge: true});
    return {type: action.type, edgeId: id};
  }
  if (businessEvent.depth >= 3) return {type: action.type, skipped: 'max_event_depth'};
  const payload = renderFieldMap(action.fields, businessEvent);
  const nextId = `evt_${eventId}_${ruleId}_${index}`.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 180);
  await org.collection('eventBus').doc(nextId).set({
    type: action.eventType,
    sourceApp: businessEvent.sourceApp,
    payload,
    depth: businessEvent.depth + 1,
    parentEventId: eventId,
    state: 'pending',
    createdAt: stamp()
  });
  return {type: action.type, eventId: nextId};
}

export const processBusinessEvent = onDocumentCreated({
  document: 'organizations/{orgId}/eventBus/{eventId}',
  region,
  retry: true
}, async event => {
  const snapshot = event.data;
  if (!snapshot) return;
  const businessEvent = snapshot.data();
  const org = root(event.params.orgId);
  const rules = await org.collection('automationRules').where('triggerEvent', '==', businessEvent.type).limit(50).get();
  let matched = 0;
  let actionsExecuted = 0;

  for (const ruleDoc of rules.docs) {
    const rule = ruleDoc.data();
    if (!rule.enabled || !eventMatchesRule(rule, businessEvent)) continue;
    matched += 1;
    const runRef = org.collection('automationRuns').doc(`${event.params.eventId}_${ruleDoc.id}`);
    const claimed = await db.runTransaction(async tx => {
      const existing = await tx.get(runRef);
      if (existing.exists) return false;
      tx.create(runRef, {
        eventId: event.params.eventId,
        ruleId: ruleDoc.id,
        state: 'running',
        startedAt: stamp()
      });
      return true;
    });
    if (!claimed) continue;

    try {
      const results = [];
      for (let index = 0; index < rule.actions.length; index += 1) {
        results.push(await executeAutomationAction({
          org,
          eventId: event.params.eventId,
          businessEvent,
          ruleId: ruleDoc.id,
          action: rule.actions[index],
          index
        }));
      }
      actionsExecuted += results.filter(result => !result.skipped).length;
      await runRef.update({state: 'completed', results, completedAt: stamp()});
    } catch (error) {
      await runRef.update({state: 'failed', error: String(error?.message || error).slice(0, 1000), completedAt: stamp()});
      throw error;
    }
  }

  await snapshot.ref.set({state: 'processed', matchedRules: matched, actionsExecuted, processedAt: stamp()}, {merge: true});
});

export const saveAgentPolicy = callable(async request => {
  const {org, user} = await authorize(request, null, true);
  const agentId = identifier(request.data.agentId);
  const displayName = textValue(request.data.displayName, 160);
  const policy = validateAgentPolicy(request.data.policy, catalog);
  await org.collection('agents').doc(agentId).set({
    agentId,
    displayName,
    policy,
    updatedBy: user,
    updatedAt: stamp()
  }, {merge: true});
  return {agentId};
});

export const requestAgentAction = callable(async request => {
  const agentId = identifier(request.data.agentId);
  const appId = identifier(request.data.appId);
  const {org, user} = await authorize(request, appId);
  const agent = (await org.collection('agents').doc(agentId).get()).data();
  if (!agent?.policy) throw new Error('Agent policy not found');
  const period = monthKey();
  const usage = (await org.collection('agentUsage').doc(`${agentId}_${period}`).get()).data();
  const spentMinor = Number.isSafeInteger(usage?.spentMinor) ? usage.spentMinor : 0;
  const decision = evaluateAgentRequest(agent.policy, {
    appId,
    action: request.data.action,
    estimatedCostMinor: request.data.estimatedCostMinor ?? 0
  }, spentMinor);
  const requestId = randomUUID();
  const audit = {
    requestId,
    agentId,
    appId,
    action: String(request.data.action),
    estimatedCostMinor: request.data.estimatedCostMinor ?? 0,
    decision,
    requestedBy: user,
    createdAt: stamp()
  };
  await org.collection('agentAudit').doc(requestId).set(audit);

  if (decision.approvalRequired) {
    await org.collection('agentApprovals').doc(requestId).set({...audit, state: 'pending'});
    return {requestId, state: 'pending_approval', decision};
  }
  if (!decision.allowed) return {requestId, state: 'blocked', decision};

  const permitId = randomUUID();
  await org.collection('agentPermits').doc(permitId).set({
    permitId,
    requestId,
    agentId,
    appId,
    action: String(request.data.action),
    state: 'issued',
    issuedAt: stamp(),
    expiresAt: Timestamp.fromMillis(Date.now() + 5 * 60 * 1000)
  });
  return {requestId, permitId, state: 'allowed', decision};
});

export const approveAgentAction = callable(async request => {
  const {org, user} = await authorize(request, null, true);
  const requestId = identifier(request.data.requestId);
  const ref = org.collection('agentApprovals').doc(requestId);
  const approval = (await ref.get()).data();
  if (!approval || approval.state !== 'pending') throw new Error('Pending approval not found');
  const approved = request.data.approved === true;
  if (!approved) {
    await ref.update({state: 'rejected', decidedBy: user, decidedAt: stamp()});
    return {requestId, state: 'rejected'};
  }
  const permitId = randomUUID();
  await db.runTransaction(async tx => {
    const fresh = await tx.get(ref);
    if (fresh.data()?.state !== 'pending') throw new Error('Approval already decided');
    tx.update(ref, {state: 'approved', decidedBy: user, decidedAt: stamp(), permitId});
    tx.create(org.collection('agentPermits').doc(permitId), {
      permitId,
      requestId,
      agentId: approval.agentId,
      appId: approval.appId,
      action: approval.action,
      state: 'issued',
      issuedAt: stamp(),
      expiresAt: Timestamp.fromMillis(Date.now() + 5 * 60 * 1000)
    });
  });
  return {requestId, permitId, state: 'approved'};
});

export const recordAgentUsage = callable(async request => {
  const {org} = await authorize(request, null, true);
  const agentId = identifier(request.data.agentId);
  const amount = request.data.costMinor;
  if (!Number.isSafeInteger(amount) || amount < 0 || amount > 1000000000) throw new Error('Invalid agent cost');
  const period = monthKey();
  const ref = org.collection('agentUsage').doc(`${agentId}_${period}`);
  await db.runTransaction(async tx => {
    const existing = await tx.get(ref);
    const spentMinor = (existing.data()?.spentMinor || 0) + amount;
    tx.set(ref, {agentId, period, spentMinor, updatedAt: stamp()}, {merge: true});
  });
  return {agentId, period};
});

export const syncOfflineBatch = callable(async request => {
  const app = identifier(request.data.appId);
  const {org, user} = await authorize(request, app);
  if (dedicatedWorkflowApps.has(app)) throw new Error(`Offline generic sync cannot bypass the dedicated ${app} workflow`);
  if (!Array.isArray(request.data.operations) || !request.data.operations.length || request.data.operations.length > 25) {
    throw new Error('Offline batch must contain 1-25 operations');
  }
  const operations = request.data.operations.map(validateOfflineOperation);
  const collection = recordCollection(org, app);

  return db.runTransaction(async tx => {
    const refs = operations.map(operation => ({
      operation,
      recordRef: collection.doc(operation.recordId),
      receiptRef: org.collection('syncReceipts').doc(`${app}_${operation.mutationId}`)
    }));
    const reads = await Promise.all(refs.flatMap(item => [tx.get(item.recordRef), tx.get(item.receiptRef)]));
    const results = [];

    for (let i = 0; i < refs.length; i += 1) {
      const {operation, recordRef, receiptRef} = refs[i];
      const recordSnapshot = reads[i * 2];
      const receiptSnapshot = reads[i * 2 + 1];
      if (receiptSnapshot.exists) {
        results.push({mutationId: operation.mutationId, ...receiptSnapshot.data(), duplicate: true});
        continue;
      }
      const serverVersion = recordSnapshot.exists && Number.isInteger(recordSnapshot.data().version)
        ? recordSnapshot.data().version
        : 0;
      if (serverVersion !== operation.baseVersion) {
        const conflict = {status: 'conflict', recordId: operation.recordId, serverVersion};
        tx.create(receiptRef, {...conflict, mutationId: operation.mutationId, createdAt: stamp()});
        results.push({mutationId: operation.mutationId, ...conflict});
        continue;
      }
      const nextVersion = serverVersion + 1;
      tx.set(recordRef, {
        ...operation.record,
        version: nextVersion,
        offlineMutationId: operation.mutationId,
        updatedBy: user,
        updatedAt: stamp()
      }, {merge: true});
      const accepted = {status: 'applied', recordId: operation.recordId, serverVersion: nextVersion};
      tx.create(receiptRef, {...accepted, mutationId: operation.mutationId, createdAt: stamp()});
      const eventRef = org.collection('eventBus').doc(`sync_${app}_${operation.mutationId}`);
      tx.set(eventRef, {
        type: `${app}.record_synced`,
        sourceApp: app,
        payload: {recordId: operation.recordId, version: nextVersion},
        depth: 0,
        state: 'pending',
        actorUid: user,
        createdAt: stamp()
      });
      results.push({mutationId: operation.mutationId, ...accepted});
    }
    return {appId: app, results};
  });
});

export const getVerticalOperatingPacks = callable(async request => {
  await authorize(request);
  return {packs: verticalPacks};
});

export const getAfricanRailsReadiness = callable(async request => {
  await authorize(request);
  return {
    mpesaSubscriptionBilling: {
      state: 'implemented',
      notes: 'Verified Daraja subscription flow is implemented when production credentials are configured.'
    },
    paystackSubscriptionBilling: {
      state: 'implemented',
      notes: 'Server-verified subscription payment flow is implemented when production credentials are configured.'
    },
    mpesaMerchantCheckout: {
      state: 'blocked_external_and_engineering',
      notes: 'Requires production merchant credentials plus checkout reconciliation, refunds, reversals and dispute handling before release.'
    },
    kraEtimsFiscalization: {
      state: 'blocked_certification',
      notes: 'Requires certified OSCU/VSCU configuration, taxpayer/device provisioning and KRA acceptance testing before fiscal issuance is enabled.'
    },
    airtelMoney: {
      state: 'catalogue_only',
      notes: 'No production settlement integration is claimed yet.'
    },
    multiCountryTax: {
      state: 'catalogue_only',
      notes: 'Country adapters exist, but provider-specific production tax engines require certification and jurisdiction testing.'
    }
  };
});
