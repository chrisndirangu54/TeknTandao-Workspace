import './index.js';
import {createHash, randomUUID} from 'node:crypto';
import {FieldValue, Timestamp, getFirestore} from 'firebase-admin/firestore';
import {HttpsError, onCall} from 'firebase-functions/v2/https';
import {catalog, canAccess, identifier, money} from './domain.js';
import {graphNodeId, monthKey} from './sota_domain.js';
import {websiteDigest} from './website_builder_domain.js';
import {productRecordDigest} from './website_business_ai_domain.js';
import {
  processTemplates,
  safeAgentExecutionActions,
  summarizeAiUsage,
  validateAgentExecution,
  validateAiUsage,
  validateConflictResolution,
  validateProcessTemplate
} from './sota_extensions_domain.js';

const db = getFirestore();
const region = 'europe-west1';
const stamp = () => FieldValue.serverTimestamp();
const root = org => db.doc(`organizations/${identifier(org)}`);
const dedicatedWorkflowApps = new Set(['pos', 'accounting', 'payments', 'etims']);
const topLevelCollectionByApp = Object.freeze({
  crm: 'contacts', inventory: 'products', hr: 'employees', projects: 'projects',
  helpdesk: 'tickets', hospital: 'patients', school: 'students', property: 'properties',
  sacco: 'sacco_members', marketing: 'marketing_campaigns', bookings: 'appointments',
  ecommerce: 'ecommerce_orders', procurement: 'procurement_pos', manufacturing: 'work_orders',
  fieldservice: 'field_dispatches', fleet: 'fleet_trips', hotel: 'hotel_rooms',
  restaurant: 'restaurant_orders', ngo: 'grants', documents: 'documents'
});

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
  if (!Object.hasOwn(catalog, app)) throw new Error('Unknown app');
  return org.collection(topLevelCollectionByApp[app] || app);
}

async function appIsActive(org, app) {
  const installation = (await org.collection('apps').doc(app).get()).data();
  return installation?.expiresAt?.toMillis?.() > Date.now();
}

function cleanDoc(data) {
  if (!data) return null;
  const result = {...data};
  for (const [key, value] of Object.entries(result)) {
    if (value?.toMillis instanceof Function) result[key] = value.toMillis();
  }
  return result;
}

function assertWebsiteSized(document) {
  if (Buffer.byteLength(JSON.stringify(document), 'utf8') > 750000) throw new Error('Website JSON is too large');
}

function executionDigest(payload) {
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

async function writeAgentEvent(org, permit, user, type, payload) {
  const ref = org.collection('eventBus').doc(`agent_evt_${permit.permitId}`.slice(0, 180));
  await ref.set({
    type,
    sourceApp: permit.appId,
    payload,
    depth: 0,
    state: 'pending',
    actorUid: user,
    agentId: permit.agentId,
    agentPermitId: permit.permitId,
    createdAt: stamp()
  }, {merge: true});
}

export const getProcessMarketplace = callable(async request => {
  const {org} = await authorize(request, null, true);
  const installed = await org.collection('automationRules').limit(100).get();
  const installedTemplates = {};
  for (const doc of installed.docs) {
    const data = doc.data();
    if (data.templateId) installedTemplates[data.templateId] = {ruleId: doc.id, version: data.templateVersion || 1, enabled: data.enabled !== false};
  }
  return {
    templates: Object.values(processTemplates).map(template => validateProcessTemplate(template, catalog)),
    installedTemplates
  };
});

export const installProcessTemplate = callable(async request => {
  const {org, user} = await authorize(request, null, true);
  const templateId = identifier(request.data.templateId);
  const raw = processTemplates[templateId];
  if (!raw) throw new Error('Unknown process template');
  const template = validateProcessTemplate(raw, catalog);
  const active = await Promise.all(template.requiredApps.map(app => appIsActive(org, app)));
  const missingApps = template.requiredApps.filter((_, index) => !active[index]);
  if (missingApps.length) throw new Error(`Install required apps first: ${missingApps.join(', ')}`);
  const ruleId = `market_${template.id}`;
  await org.collection('automationRules').doc(ruleId).set({
    ...template.rule,
    ruleId,
    templateId: template.id,
    templateVersion: template.version,
    marketplaceInstalled: true,
    updatedBy: user,
    updatedAt: stamp()
  }, {merge: true});
  return {templateId, ruleId, version: template.version};
});

export const uninstallProcessTemplate = callable(async request => {
  const {org} = await authorize(request, null, true);
  const templateId = identifier(request.data.templateId);
  const ruleId = `market_${template.id}`;
  const ref = org.collection('automationRules').doc(ruleId);
  const snapshot = await ref.get();
  if (!snapshot.exists || snapshot.data().templateId !== templateId) throw new Error('Installed process template not found');
  await ref.delete();
  return {templateId, removed: true};
});

export const executeAgentAction = callable(async request => {
  const {org, user, member} = await authorize(request);
  const permitId = identifier(request.data.permitId);
  const permitRef = org.collection('agentPermits').doc(permitId);
  const permit = (await permitRef.get()).data();
  if (!permit) throw new Error('Agent permit not found');
  if (!['issued', 'executing', 'consumed'].includes(permit.state)) throw new Error('Agent permit is not executable');
  if (permit.expiresAt?.toMillis?.() <= Date.now() && permit.state !== 'consumed') throw new Error('Agent permit expired');

  await authorize(request, permit.appId);
  const [auditSnap, agentSnap] = await Promise.all([
    org.collection('agentAudit').doc(permit.requestId).get(),
    org.collection('agents').doc(permit.agentId).get()
  ]);
  const audit = auditSnap.data();
  const agent = agentSnap.data();
  if (!audit || !agent?.policy) throw new Error('Agent policy or audit trail missing');
  if (audit.requestedBy !== user && member.role !== 'owner') throw new HttpsError('permission-denied', 'Permit belongs to another user');
  if (!agent.policy.active || !agent.policy.allowedApps.includes(permit.appId) || !agent.policy.allowedActions.includes(permit.action)) {
    throw new Error('Agent policy no longer permits this action');
  }

  const execution = validateAgentExecution({action: request.data.action, payload: request.data.payload}, permit.appId);
  if (execution.action !== permit.action) throw new Error('Permit action does not match execution');
  const approvedPayloadDigest = audit.websiteAiContext?.payloadDigest;
  if (approvedPayloadDigest && executionDigest(execution.payload) !== approvedPayloadDigest) {
    throw new Error('Agent permit payload does not match the approved Website AI action');
  }
  const executionRef = org.collection('agentExecutions').doc(permitId);
  if (permit.state === 'consumed') {
    const existing = (await executionRef.get()).data();
    return {permitId, replay: true, execution: cleanDoc(existing)};
  }

  const period = monthKey();
  const usageRef = org.collection('agentUsage').doc(`${permit.agentId}_${period}`);
  const usage = (await usageRef.get()).data();
  const spentMinor = Number.isSafeInteger(usage?.spentMinor) ? usage.spentMinor : 0;
  const estimatedCostMinor = Number.isSafeInteger(audit.estimatedCostMinor) ? audit.estimatedCostMinor : 0;
  if (spentMinor + estimatedCostMinor > agent.policy.monthlyBudgetMinor) throw new Error('Agent monthly budget is now exceeded');

  await db.runTransaction(async tx => {
    const freshPermit = await tx.get(permitRef);
    const state = freshPermit.data()?.state;
    if (state === 'consumed') return;
    if (!['issued', 'executing'].includes(state)) throw new Error('Agent permit is not executable');
    tx.set(executionRef, {
      permitId,
      requestId: permit.requestId,
      agentId: permit.agentId,
      appId: permit.appId,
      action: execution.action,
      state: 'running',
      startedBy: user,
      startedAt: stamp()
    }, {merge: true});
    tx.update(permitRef, {state: 'executing', executionStartedAt: stamp()});
  });

  let result;
  try {
    const deterministicId = `agent_${permitId}`.slice(0, 180);
    if (execution.action === 'record.create') {
      const ref = recordCollection(org, permit.appId).doc(execution.payload.recordId || deterministicId);
      const existing = await ref.get();
      if (existing.exists && existing.data().agentPermitId !== permitId) throw new Error('Target record already exists');
      if (!existing.exists) {
        await ref.create({
          ...execution.payload.record,
          agentId: permit.agentId,
          agentPermitId: permitId,
          createdBy: user,
          createdAt: stamp(),
          updatedBy: user,
          updatedAt: stamp()
        });
      }
      result = {recordId: ref.id, appId: permit.appId};
      await writeAgentEvent(org, {...permit, permitId}, user, `${permit.appId}.record_created`, {recordId: ref.id});
    } else if (execution.action === 'record.update') {
      const ref = recordCollection(org, permit.appId).doc(execution.payload.recordId);
      const existing = await ref.get();
      if (!existing.exists) throw new Error('Target record not found');
      if (execution.payload.expectedRecordDigest && permit.appId === 'inventory') {
        const currentDigest = productRecordDigest(ref.id, existing.data());
        if (currentDigest !== execution.payload.expectedRecordDigest) {
          throw new Error('Product changed since the AI plan was generated; regenerate the plan before editing');
        }
      }
      await ref.set({
        ...execution.payload.record,
        agentId: permit.agentId,
        agentPermitId: permitId,
        updatedBy: user,
        updatedAt: stamp()
      }, {merge: true});
      result = {recordId: ref.id, appId: permit.appId, updated: true};
      await writeAgentEvent(org, {...permit, permitId}, user, `${permit.appId}.record_updated`, {recordId: ref.id});
    } else if (execution.action === 'task.create') {
      if (permit.appId !== 'crm') throw new Error('task.create requires a CRM-scoped permit');
      const ref = org.collection('tasks').doc(deterministicId);
      await ref.set({
        name: execution.payload.title,
        status: 'open',
        agentId: permit.agentId,
        agentPermitId: permitId,
        createdAt: stamp()
      }, {merge: true});
      result = {taskId: ref.id};
    } else if (execution.action === 'event.publish') {
      const ref = org.collection('eventBus').doc(deterministicId);
      await ref.set({
        ...execution.payload.event,
        state: 'pending',
        actorUid: user,
        agentId: permit.agentId,
        agentPermitId: permitId,
        createdAt: stamp()
      }, {merge: true});
      result = {eventId: ref.id};
    } else if (execution.action === 'website.document.apply') {
      const {projectId, expectedRevision, document, planId} = execution.payload;
      assertWebsiteSized(document);
      const projectRef = org.collection('websiteProjects').doc(projectId);
      const collaborationRef = org.collection('websiteCollaboration').doc(projectId);
      const nextRevision = await db.runTransaction(async tx => {
        const [projectSnapshot, collaborationSnapshot] = await Promise.all([tx.get(projectRef), tx.get(collaborationRef)]);
        if (!projectSnapshot.exists) throw new Error('Website project not found');
        const project = projectSnapshot.data();
        if (project.revision !== expectedRevision) throw new Error(`Website changed since AI planning; server revision is ${project.revision}`);
        const revision = expectedRevision + 1;
        tx.update(projectRef, {
          draft: document,
          title: document.title,
          revision,
          status: project.publishedVersion ? 'modified' : 'draft',
          aiPlanId: planId,
          updatedBy: user,
          updatedAt: stamp()
        });
        tx.set(org.collection('websiteProjectEvents').doc(`${projectId}_${revision}`), {
          projectId,
          revision,
          kind: 'agent_replace_document',
          planId,
          agentId: permit.agentId,
          agentPermitId: permitId,
          digest: websiteDigest(document),
          actorUid: user,
          createdAt: stamp()
        });
        const epoch = Number(collaborationSnapshot.data()?.epoch || 1) + 1;
        tx.set(collaborationRef, {
          projectId,
          epoch,
          base: document,
          materializedOpCount: 0,
          materializedOpSetHash: '',
          checkpointedBy: user,
          checkpointedAt: stamp()
        }, {merge: true});
        if (planId) tx.set(org.collection('websiteAiPlans').doc(planId), {state: 'draft_applied', appliedRevision: revision, appliedAt: stamp()}, {merge: true});
        return revision;
      });
      result = {projectId, revision: nextRevision, digest: websiteDigest(document)};
      await writeAgentEvent(org, {...permit, permitId}, user, 'website.ai_document_applied', {projectId, revision: nextRevision});
    } else if (execution.action === 'website.publish') {
      const {projectId, planId} = execution.payload;
      const projectRef = org.collection('websiteProjects').doc(projectId);
      result = await db.runTransaction(async tx => {
        const projectSnapshot = await tx.get(projectRef);
        if (!projectSnapshot.exists) throw new Error('Website project not found');
        const project = projectSnapshot.data();
        assertWebsiteSized(project.draft);
        const ownerRef = db.doc(`websitePublicSiteOwners/${identifier(project.publicId)}`);
        const ownerSnapshot = await tx.get(ownerRef);
        if (!ownerSnapshot.exists || ownerSnapshot.data().orgId !== org.id || ownerSnapshot.data().projectId !== projectId) throw new Error('Public site ownership mismatch');
        const version = (Number.isInteger(project.publishedVersion) ? project.publishedVersion : 0) + 1;
        const digest = websiteDigest(project.draft);
        tx.set(org.collection('websiteVersions').doc(`${projectId}_${version}`), {
          projectId,
          version,
          revision: project.revision,
          document: project.draft,
          digest,
          publishedBy: user,
          agentId: permit.agentId,
          agentPermitId: permitId,
          publishedAt: stamp()
        });
        tx.set(db.doc(`publishedWebsiteSites/${identifier(project.publicId)}`), {
          publicId: project.publicId,
          version,
          revision: project.revision,
          digest,
          document: project.draft,
          publishedAt: stamp()
        });
        tx.update(projectRef, {publishedVersion: version, publishedDigest: digest, status: 'published', publishedBy: user, publishedAt: stamp(), updatedAt: stamp()});
        if (planId) tx.set(org.collection('websiteAiPlans').doc(planId), {state: 'published', publishedVersion: version, publishedAt: stamp()}, {merge: true});
        return {projectId, publicId: project.publicId, version, revision: project.revision, digest};
      });
      await writeAgentEvent(org, {...permit, permitId}, user, 'website.published', {projectId, version: result.version});
    } else {
      const node = execution.payload.node;
      const nodeId = graphNodeId(node);
      await org.collection('businessGraphNodes').doc(nodeId).set({
        ...node,
        nodeId,
        agentId: permit.agentId,
        agentPermitId: permitId,
        updatedBy: user,
        updatedAt: stamp()
      }, {merge: true});
      result = {nodeId};
    }

    await db.runTransaction(async tx => {
      const [freshExecution, freshUsage] = await Promise.all([tx.get(executionRef), tx.get(usageRef)]);
      const alreadyCosted = freshExecution.data()?.costRecorded === true;
      tx.set(executionRef, {state: 'completed', result, completedAt: stamp(), costRecorded: true}, {merge: true});
      tx.set(permitRef, {state: 'consumed', consumedAt: stamp(), result}, {merge: true});
      tx.set(org.collection('agentAudit').doc(permit.requestId), {executedAt: stamp(), executionState: 'completed', result}, {merge: true});
      if (!alreadyCosted && estimatedCostMinor > 0) {
        tx.set(usageRef, {
          agentId: permit.agentId,
          period,
          spentMinor: (freshUsage.data()?.spentMinor || 0) + estimatedCostMinor,
          updatedAt: stamp()
        }, {merge: true});
      }
    });
    return {permitId, state: 'completed', result};
  } catch (error) {
    await executionRef.set({state: 'failed', error: String(error?.message || error).slice(0, 1000), failedAt: stamp()}, {merge: true});
    throw error;
  }
});

export const saveAiFinOpsBudget = callable(async request => {
  const {org, user} = await authorize(request, null, true);
  const monthlyBudgetMinor = money(request.data.monthlyBudgetMinor ?? 0);
  const warnPercent = request.data.warnPercent ?? 80;
  if (!Number.isInteger(warnPercent) || warnPercent < 50 || warnPercent > 100) throw new Error('Invalid warning percentage');
  await org.collection('aiFinOpsConfig').doc('default').set({monthlyBudgetMinor, warnPercent, updatedBy: user, updatedAt: stamp()}, {merge: true});
  return {monthlyBudgetMinor, warnPercent};
});

export const recordAiUsage = callable(async request => {
  const {org, user} = await authorize(request, null, true);
  const usage = validateAiUsage(request.data.usage, catalog);
  const period = monthKey();
  const ref = org.collection('aiUsage').doc(`ai_${usage.requestId}`);
  try {
    await ref.create({...usage, period, recordedBy: user, createdAt: stamp()});
    return {requestId: usage.requestId, duplicate: false};
  } catch (error) {
    if (error?.code === 6 || String(error?.message || '').toLowerCase().includes('already exists')) {
      return {requestId: usage.requestId, duplicate: true};
    }
    throw error;
  }
});

export const getAiFinOpsSummary = callable(async request => {
  const {org} = await authorize(request, null, true);
  const period = request.data.period ? String(request.data.period) : monthKey();
  if (!/^\d{4}-\d{2}$/.test(period)) throw new Error('Invalid period');
  const [usageSnapshot, configSnapshot] = await Promise.all([
    org.collection('aiUsage').where('period', '==', period).limit(1000).get(),
    org.collection('aiFinOpsConfig').doc('default').get()
  ]);
  const config = configSnapshot.data() || {};
  return {
    period,
    warnPercent: Number.isInteger(config.warnPercent) ? config.warnPercent : 80,
    summary: summarizeAiUsage(usageSnapshot.docs.map(doc => doc.data()), config.monthlyBudgetMinor || 0)
  };
});

export const resolveSyncConflict = callable(async request => {
  const appId = identifier(request.data.appId);
  const mutationId = identifier(request.data.mutationId);
  const resolution = validateConflictResolution({strategy: request.data.strategy, record: request.data.record});
  const {org, user} = await authorize(request, null, true);
  if (dedicatedWorkflowApps.has(appId)) throw new Error(`Use the dedicated ${appId} reconciliation workflow`);
  const receiptRef = org.collection('syncReceipts').doc(`${appId}_${mutationId}`);
  const recordRef = recordCollection(org, appId).doc(identifier(request.data.recordId));

  return db.runTransaction(async tx => {
    const [receipt, record] = await Promise.all([tx.get(receiptRef), tx.get(recordRef)]);
    if (!receipt.exists || receipt.data().status !== 'conflict') throw new Error('Open sync conflict not found');
    if (receipt.data().recordId !== recordRef.id) throw new Error('Conflict record mismatch');
    const currentVersion = Number.isInteger(record.data()?.version) ? record.data().version : 0;
    if (currentVersion !== receipt.data().serverVersion) throw new Error('Server record changed again; refresh the conflict');
    if (resolution.strategy === 'server_wins') {
      tx.update(receiptRef, {status: 'resolved_server', resolvedBy: user, resolvedAt: stamp()});
      return {status: 'resolved_server', serverVersion: currentVersion};
    }
    const nextVersion = currentVersion + 1;
    tx.set(recordRef, {
      ...resolution.record,
      version: nextVersion,
      conflictResolutionMutationId: mutationId,
      updatedBy: user,
      updatedAt: stamp()
    }, {merge: true});
    tx.update(receiptRef, {status: 'resolved_client', resolvedBy: user, resolvedAt: stamp(), resolvedVersion: nextVersion});
    return {status: 'resolved_client', serverVersion: nextVersion};
  });
});

export const getControlPlaneOverview = callable(async request => {
  const {org} = await authorize(request, null, true);
  const collections = [
    'businessGraphNodes', 'businessGraphEdges', 'automationRules', 'automationRuns',
    'agents', 'agentApprovals', 'syncReceipts', 'aiUsage'
  ];
  const counts = await Promise.all(collections.map(name => org.collection(name).count().get()));
  const result = {};
  collections.forEach((name, index) => { result[name] = counts[index].data().count; });
  const pendingApprovals = await org.collection('agentApprovals').where('state', '==', 'pending').count().get();
  const conflicts = await org.collection('syncReceipts').where('status', '==', 'conflict').count().get();
  return {
    counts: result,
    pendingApprovals: pendingApprovals.data().count,
    openSyncConflicts: conflicts.data().count,
    safeAgentActions: safeAgentExecutionActions,
    generatedAt: Date.now()
  };
});
