import './index.js';
import {createHash, randomUUID} from 'node:crypto';
import {FieldValue, Timestamp, getFirestore} from 'firebase-admin/firestore';
import {HttpsError, onCall} from 'firebase-functions/v2/https';
import {canAccess, identifier} from './domain.js';
import {evaluateAgentRequest, monthKey} from './sota_domain.js';
import {validateAgentExecution} from './sota_extensions_domain.js';
import {websiteBuilderAppId, websiteBusinessAgentId} from './website_business_ai_domain.js';

const db = getFirestore();
const region = 'europe-west1';
const stamp = () => FieldValue.serverTimestamp();
const root = orgId => db.doc(`organizations/${identifier(orgId)}`);

function uid(request) {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in first');
  return request.auth.uid;
}

async function authorize(request) {
  const user = uid(request);
  const org = root(request.data.orgId);
  const member = (await org.collection('members').doc(user).get()).data();
  if (!member || member.role !== 'owner') throw new HttpsError('permission-denied', 'Owner access required');
  const installation = (await org.collection('apps').doc(websiteBuilderAppId).get()).data();
  if (!canAccess(member, websiteBuilderAppId, installation)) throw new HttpsError('permission-denied', 'Website Builder subscription required');
  return {org, user, member};
}

function callable(handler) {
  return onCall({region}, async request => {
    try { return await handler(request); }
    catch (error) {
      if (error instanceof HttpsError) throw error;
      throw new HttpsError('failed-precondition', String(error?.message || 'Website AI governance failed').slice(0, 1200));
    }
  });
}

function digest(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function actionFromPlan(plan, input) {
  const kind = String(input.kind || '');
  if (kind === 'apply_document') {
    return {
      appId: websiteBuilderAppId,
      action: 'website.document.apply',
      mutationId: null,
      payload: {
        projectId: plan.projectId,
        expectedRevision: plan.sourceRevision,
        document: plan.document,
        planId: plan.planId,
      },
    };
  }
  if (kind === 'publish') {
    return {
      appId: websiteBuilderAppId,
      action: 'website.publish',
      mutationId: null,
      payload: {projectId: plan.projectId, planId: plan.planId},
    };
  }
  if (kind === 'product') {
    const mutationId = identifier(input.mutationId);
    const mutation = (plan.productChanges || []).find(item => item.mutationId === mutationId);
    if (!mutation) throw new Error('Product mutation not found in AI plan');
    const action = mutation.operation === 'create' ? 'record.create' : 'record.update';
    const payload = mutation.operation === 'create'
      ? {recordId: mutation.productId || mutation.mutationId, record: mutation.product}
      : {recordId: mutation.productId, record: mutation.product, expectedRecordDigest: mutation.baseProductDigest};
    return {appId: 'inventory', action, mutationId, payload};
  }
  throw new Error('Unknown Website AI action kind');
}

function validatedAction(plan, input) {
  const execution = actionFromPlan(plan, input);
  const validated = validateAgentExecution({action: execution.action, payload: execution.payload}, execution.appId);
  return {...execution, payload: validated.payload};
}

async function loadPlan(org, planId) {
  const snapshot = await org.collection('websiteAiPlans').doc(identifier(planId)).get();
  if (!snapshot.exists) throw new Error('Website AI plan not found');
  return {planId: snapshot.id, ...snapshot.data()};
}

async function assertAppAccess(org, member, appId) {
  const installation = (await org.collection('apps').doc(appId).get()).data();
  if (!canAccess(member, appId, installation)) throw new Error(`Install and authorize ${appId} before executing this action`);
}

export const requestWebsiteBusinessAction = callable(async request => {
  const {org, user, member} = await authorize(request);
  const plan = await loadPlan(org, request.data.planId);
  const execution = validatedAction(plan, request.data);
  await assertAppAccess(org, member, execution.appId);
  const agent = (await org.collection('agents').doc(websiteBusinessAgentId).get()).data();
  if (!agent?.policy) throw new Error('Create the Website Business Operator agent first');
  const period = monthKey();
  const usage = (await org.collection('agentUsage').doc(`${websiteBusinessAgentId}_${period}`).get()).data();
  const spentMinor = Number.isSafeInteger(usage?.spentMinor) ? usage.spentMinor : 0;
  const estimatedCostMinor = Number.isSafeInteger(request.data.estimatedCostMinor) ? request.data.estimatedCostMinor : 0;
  const decision = evaluateAgentRequest(agent.policy, {
    appId: execution.appId,
    action: execution.action,
    estimatedCostMinor,
  }, spentMinor);
  const requestId = randomUUID();
  const payloadDigest = digest(execution.payload);
  const context = {
    planId: plan.planId,
    kind: String(request.data.kind),
    mutationId: execution.mutationId,
    payloadDigest,
  };
  const audit = {
    requestId,
    agentId: websiteBusinessAgentId,
    appId: execution.appId,
    action: execution.action,
    estimatedCostMinor,
    decision,
    requestedBy: user,
    websiteAiContext: context,
    createdAt: stamp(),
  };
  const mappingRef = org.collection('websiteAiActionRequests').doc(requestId);
  await mappingRef.set({
    requestId,
    ...context,
    appId: execution.appId,
    action: execution.action,
    requestedBy: user,
    state: decision.approvalRequired ? 'pending_approval' : decision.allowed ? 'allowed' : 'blocked',
    createdAt: stamp(),
  });
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
    agentId: websiteBusinessAgentId,
    appId: execution.appId,
    action: execution.action,
    state: 'issued',
    issuedAt: stamp(),
    expiresAt: Timestamp.fromMillis(Date.now() + 5 * 60 * 1000),
  });
  await mappingRef.set({permitId, state: 'allowed'}, {merge: true});
  return {requestId, permitId, state: 'allowed', decision};
});

export const resolveWebsiteBusinessAction = callable(async request => {
  const {org} = await authorize(request);
  const requestId = identifier(request.data.requestId);
  const mapping = (await org.collection('websiteAiActionRequests').doc(requestId).get()).data();
  if (!mapping) throw new Error('Website AI action request not found');
  const plan = await loadPlan(org, mapping.planId);
  const execution = validatedAction(plan, {kind: mapping.kind, mutationId: mapping.mutationId});
  if (digest(execution.payload) !== mapping.payloadDigest) throw new Error('Website AI action payload changed after approval request');
  const audit = (await org.collection('agentAudit').doc(requestId).get()).data();
  if (!audit || audit.action !== execution.action || audit.appId !== execution.appId || audit.websiteAiContext?.payloadDigest !== mapping.payloadDigest) {
    throw new Error('Agent audit does not match the Website AI action');
  }
  let permitId = mapping.permitId || null;
  if (!permitId) {
    const approval = (await org.collection('agentApprovals').doc(requestId).get()).data();
    if (approval?.state !== 'approved' || !approval.permitId) throw new Error('Website AI action has not been approved yet');
    permitId = approval.permitId;
    await org.collection('websiteAiActionRequests').doc(requestId).set({permitId, state: 'approved'}, {merge: true});
  }
  return {
    requestId,
    permitId,
    action: execution.action,
    appId: execution.appId,
    payload: execution.payload,
    context: {planId: plan.planId, kind: mapping.kind, mutationId: mapping.mutationId || null},
  };
});
