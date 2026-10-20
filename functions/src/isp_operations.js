import './index.js';
import {randomUUID} from 'node:crypto';
import {getFirestore, FieldValue} from 'firebase-admin/firestore';
import {onCall, HttpsError} from 'firebase-functions/v2/https';
import {z} from 'zod';
import {isSuperAdminToken} from './super_admin_domain.js';

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
  return onCall({region, timeoutSeconds: 60, enforceAppCheck: false}, async request => {
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
  const exists = await db.collection('ispSubscribers').where('accountCode', '==', input.accountCode).limit(1).get();
  if (!exists.empty) throw new HttpsError('already-exists', 'Subscriber account code already exists');
  const id = randomUUID();
  await db.collection('ispSubscribers').doc(id).create({
    ...input, status: 'planned', provisioningStatus: 'not_connected',
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
    const allowed = {open: ['acknowledged', 'resolved'], acknowledged: ['resolved'], resolved: []};
    if (!allowed[previous]?.includes(input.status)) throw new HttpsError('failed-precondition', 'Invalid incident status transition');
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
    const allowed = {open: ['in_progress', 'completed'], in_progress: ['completed'], completed: []};
    if (!allowed[previous]?.includes(input.status)) throw new HttpsError('failed-precondition', 'Invalid work order status transition');
    tx.update(ref, {status: input.status, updatedAt: now(), updatedBy: uid});
  });
  await audit(uid, 'isp.workorder.' + input.status, 'workorder', input.id);
  return {ok: true};
});
