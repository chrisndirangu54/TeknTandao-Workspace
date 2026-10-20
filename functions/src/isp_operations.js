import './index.js';
import {randomUUID} from 'node:crypto';
import {getFirestore, FieldValue} from 'firebase-admin/firestore';
import {onCall, HttpsError} from 'firebase-functions/v2/https';
import {z} from 'zod';
import {isSuperAdminToken} from './super_admin_domain.js';
import {canChangeIncidentStatus, canChangeWorkOrderStatus, canonicalSubscriberCode} from './isp_domain.js';
import {evaluateLink, summarizeTelemetry, possibleSharedFault} from './isp_analytics_domain.js';

// ISP operations here are management records only. No router credentials,
// M-Pesa credentials, or device commands are handled by this module.
const db = getFirestore();
const region = 'europe-west1';
const now = () => FieldValue.serverTimestamp();
const shortText = z.string().trim().min(1).max(120);
const details = z.string().trim().max(1500);
const docId = z.string().uuid();
const access = z.enum(['fiber', 'wireless', 'core', 'other']);
const lifecycle = z.enum(['planned', 'installed', 'retired']);
const incidentState = z.enum(['open', 'acknowledged', 'resolved']);
const taskState = z.enum(['open', 'in_progress', 'completed']);

function actor(request) {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in required');
  if (!isSuperAdminToken(request.auth.token || {})) {
    throw new HttpsError('permission-denied', 'Super administrator access required');
  }
  return request.auth.uid;
}

function callable(handler) {
  return onCall({region, timeoutSeconds: 60}, async request => {
    try { return await handler(request); }
    catch (error) {
      if (error instanceof HttpsError) throw error;
      if (error instanceof z.ZodError) throw new HttpsError('invalid-argument', 'Invalid ISP operations form values');
      throw new HttpsError('internal', 'ISP operation failed');
    }
  });
}

async function audit(uid, action, resource, resourceId) {
  await db.collection('ispAudit').add({actorUid: uid, action, resource, resourceId, createdAt: now()});
}

const readCollection = async name => {
  const snapshot = await db.collection(name).limit(100).get();
  return snapshot.docs.map(d => ({id: d.id, ...d.data(),
    createdAt: d.data().createdAt?.toDate?.()?.toISOString?.() || null,
    updatedAt: d.data().updatedAt?.toDate?.()?.toISOString?.() || null,
  }));
};

export const ispAdminOverview = callable(async request => {
  actor(request);
  const [devices, subscribers, incidents, workOrders] = await Promise.all([
    readCollection('ispDevices'), readCollection('ispSubscribers'),
    readCollection('ispIncidents'), readCollection('ispWorkOrders')
  ]);
  return {devices, subscribers, incidents, workOrders, maximumPerCollection: 100,
    telemetryConnected: false, billingConnected: false, provisioningConnected: false};
});

export const ispRegisterDevice = callable(async request => {
  const uid = actor(request);
  const input = z.object({
    label: shortText, vendor: shortText, model: shortText,
    role: access, site: shortText,
    serial: z.string().trim().max(120).default(''),
    lifecycle: lifecycle.default('planned'),
    notes: details.default('')
  }).strict().parse(request.data);
  const id = randomUUID();
  await db.collection('ispDevices').doc(id).create({
    ...input, telemetryStatus: 'not_connected', verifiedIntegration: false,
    createdAt: now(), createdBy: uid, updatedAt: now()
  });
  await audit(uid, 'isp.device.register', 'device', id);
  return {ok: true, id};
});

export const ispAddSubscriber = callable(async request => {
  const uid = actor(request);
  const input = z.object({
    accountCode: z.string().trim().min(2).max(64).regex(/^[A-Za-z0-9_-]+$/),
    site: shortText, accessType: z.enum(['fiber', 'wireless']),
    planMbps: z.number().int().min(1).max(10000)
  }).strict().parse(request.data);
  const id = canonicalSubscriberCode(input.accountCode);
  await db.collection('ispSubscribers').doc(id).create({
    ...input, accountCode: id, status: 'planned', provisioningStatus: 'not_connected',
    createdBy: uid, createdAt: now(), updatedAt: now()
  });
  await audit(uid, 'isp.subscriber.plan', 'subscriber', id);
  return {ok: true, id};
});

export const ispCreateIncident = callable(async request => {
  const uid = actor(request);
  const input = z.object({
    title: shortText, site: shortText,
    severity: z.enum(['low', 'medium', 'high', 'critical']),
    description: details.default('')
  }).strict().parse(request.data);
  const id = randomUUID();
  await db.collection('ispIncidents').doc(id).create({
    ...input, status: 'open', createdBy: uid, createdAt: now(), updatedAt: now()
  });
  await audit(uid, 'isp.incident.create', 'incident', id);
  return {ok: true, id};
});

export const ispSetIncidentStatus = callable(async request => {
  const uid = actor(request);
  const input = z.object({id: docId, status: incidentState}).strict().parse(request.data);
  const ref = db.collection('ispIncidents').doc(input.id);
  await db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError('not-found', 'Incident not found');
    const previous = snap.data().status;
    if (!canChangeIncidentStatus(previous, input.status)) throw new HttpsError('failed-precondition', 'Invalid incident status transition');
    tx.update(ref, {status: input.status, updatedAt: now(), updatedBy: uid});
  });
  await audit(uid, 'isp.incident.' + input.status, 'incident', input.id);
  return {ok: true};
});

export const ispCreateWorkOrder = callable(async request => {
  const uid = actor(request);
  const input = z.object({
    title: shortText, site: shortText, description: details.default(''),
    priority: z.enum(['low', 'normal', 'urgent']).default('normal')
  }).strict().parse(request.data);
  const id = randomUUID();
  await db.collection('ispWorkOrders').doc(id).create({
    ...input, status: 'open', createdBy: uid, createdAt: now(), updatedAt: now()
  });
  await audit(uid, 'isp.workorder.create', 'workorder', id);
  return {ok: true, id};
});

export const ispSetWorkOrderStatus = callable(async request => {
  const uid = actor(request);
  const input = z.object({id: docId, status: taskState}).strict().parse(request.data);
  const ref = db.collection('ispWorkOrders').doc(input.id);
  await db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError('not-found', 'Work order not found');
    const previous = snap.data().status;
    if (!canChangeWorkOrderStatus(previous, input.status)) throw new HttpsError('failed-precondition', 'Invalid work order status transition');
    tx.update(ref, {status: input.status, updatedAt: now(), updatedBy: uid});
  });
  await audit(uid, 'isp.workorder.' + input.status, 'workorder', input.id);
  return {ok: true};
});

// Admin-submitted telemetry intake: validated and audited, never auto-acts on
// the network. A future device collector requires a separate credential-scoped
// ingestion endpoint, NOT public access to this callable.
export const ispRecordTelemetry = callable(async request => {
  const uid = actor(request);
  const input = z.object({
    deviceId: z.string().uuid(),
    site: shortText,
    segmentId: z.string().trim().max(120).default(''),
    latencyMs: z.number().min(0).max(60000),
    jitterMs: z.number().min(0).max(60000),
    packetLossPct: z.number().min(0).max(100),
    utilizationPct: z.number().min(0).max(100)
  }).strict().parse(request.data);
  const device = await db.collection('ispDevices').doc(input.deviceId).get();
  if (!device.exists) throw new HttpsError('not-found', 'Device not registered');
  const health = evaluateLink(input);
  const id = randomUUID();
  await db.collection('ispTelemetry').doc(id).create({
    ...input, ...health, source: 'manual_admin',
    submittedBy: uid, createdAt: now()
  });
  await audit(uid, 'isp.telemetry.record', 'telemetry', id);
  return {ok: true, id, health};
});

export const ispTelemetrySummary = callable(async request => {
  actor(request);
  const snapshot = await db.collection('ispTelemetry')
    .orderBy('createdAt', 'desc').limit(250).get();
  const samples = snapshot.docs.map(d => ({id: d.id, ...d.data()}));
  return {
    ...summarizeTelemetry(samples),
    sharedFaultCandidates: possibleSharedFault(samples),
    connectedToLiveDevices: false,
    queryLimit: 250,
  };
});

// Provisioning requires an explicit approval record; this function only
// writes a pending request, without executing RADIUS/OLT/ACS operations.
export const ispRequestProvisioning = callable(async request => {
  const uid = actor(request);
  const input = z.object({
    subscriberId: z.string().regex(/^[A-Z0-9_-]{2,64}$/),
    deviceId: z.string().uuid(),
    operation: z.enum(['activate', 'suspend', 'change_plan', 'deactivate']),
    justification: z.string().trim().min(10).max(1000)
  }).strict().parse(request.data);
  const [sub, device] = await Promise.all([
    db.collection('ispSubscribers').doc(input.subscriberId).get(),
    db.collection('ispDevices').doc(input.deviceId).get(),
  ]);
  if (!sub.exists || !device.exists)
    throw new HttpsError('not-found', 'Subscriber and registered device are required');
  const id = randomUUID();
  await db.collection('ispProvisioningRequests').doc(id).create({
    ...input, state: 'awaiting_approval',
    executionState: 'not_connected', requestedBy: uid, createdAt: now()
  });
  await audit(uid, 'isp.provisioning.request', 'provisioning', id);
  return {ok: true, id, state: 'awaiting_approval', executed: false};
});

export const ispListProvisioningRequests = callable(async request => {
  actor(request);
  const snapshot = await db.collection('ispProvisioningRequests').limit(100).get();
  return {requests: snapshot.docs.map(d => ({id: d.id, ...d.data(),
    createdAt: d.data().createdAt?.toDate?.()?.toISOString?.() || null,
  }))};
});
