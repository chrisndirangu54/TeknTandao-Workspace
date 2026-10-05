import './index.js';
import {getAuth} from 'firebase-admin/auth';
import {FieldValue, getFirestore} from 'firebase-admin/firestore';
import {HttpsError, onCall} from 'firebase-functions/v2/https';
import {applicationDefault} from 'firebase-admin/app';
import {z} from 'zod';
import {
  isBootstrapSuperAdminToken,
  isSuperAdminToken,
} from './super_admin_domain.js';

const db = getFirestore();
const auth = getAuth();
const region = 'europe-west1';
const stamp = () => FieldValue.serverTimestamp();
const secretId = z.string().trim().min(1).max(255).regex(/^[A-Za-z0-9_-]+$/);
const versionId = z.string().trim().regex(/^[0-9]+$/);
const projectId = () =>
  process.env.GCLOUD_PROJECT ||
  process.env.GOOGLE_CLOUD_PROJECT ||
  process.env.GCP_PROJECT ||
  '';

function callable(handler) {
  return onCall({region, timeoutSeconds: 120, memory: '512MiB'}, async request => {
    try {
      return await handler(request);
    } catch (error) {
      if (error instanceof HttpsError) throw error;
      const message = String(error?.message || 'Security operation failed')
        .replace(/projects\/[A-Za-z0-9._:-]+\/secrets\/[A-Za-z0-9_-]+\/versions\/[0-9]+/g, '[secret-version]')
        .slice(0, 500);
      throw new HttpsError('failed-precondition', message);
    }
  });
}

function requireSuperAdmin(request, {recentSeconds = 900, rootOnly = false} = {}) {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in first');
  const token = request.auth.token || {};
  if (rootOnly ? !isBootstrapSuperAdminToken(token) : !isSuperAdminToken(token)) {
    throw new HttpsError('permission-denied', rootOnly ? 'Root super administrator required' : 'Super administrator required');
  }
  const authTime = Number(token.auth_time || 0) * 1000;
  if (!authTime || Date.now() - authTime > recentSeconds * 1000) {
    throw new HttpsError('unauthenticated', 'Re-authentication is required for this high-security operation');
  }
  return request.auth;
}

async function audit(actor, action, details = {}) {
  await db.collection('platformSecurityAudit').add({
    action,
    actorUid: actor.uid,
    actorEmail: actor.token?.email || '',
    ...details,
    createdAt: stamp(),
  });
}

function parent() {
  const id = projectId();
  if (!id) throw new Error('Google Cloud project ID is unavailable');
  return `projects/${id}`;
}

function resource(id) {
  return `${parent()}/secrets/${secretId.parse(id)}`;
}

function versionResource(id, version) {
  return `${resource(id)}/versions/${versionId.parse(String(version))}`;
}

function lastSegment(name = '') {
  return name.split('/').filter(Boolean).at(-1) || '';
}

async function googleToken() {
  const credential = applicationDefault();
  const token = await credential.getAccessToken();
  if (!token?.access_token) throw new Error('Unable to obtain Google Cloud access token');
  return token.access_token;
}

async function secretManagerJson(path, {method = 'GET', body} = {}) {
  const token = await googleToken();
  const response = await fetch('https://secretmanager.googleapis.com/v1/' + path, {
    method,
    headers: {
      Authorization: 'Bearer ' + token,
      'Content-Type': 'application/json',
    },
    ...(body === undefined ? {} : {body: JSON.stringify(body)}),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = payload?.error?.message || ('Secret Manager request failed (' + response.status + ')');
    const error = new Error(message);
    error.code = response.status;
    throw error;
  }
  return payload;
}

async function listVersionsFor(name) {
  const payload = await secretManagerJson(name + '/versions?pageSize=20');
  return (payload.versions || [])
    .filter((v) => v.name && lastSegment(v.name) !== '0')
    .map((v) => ({
      version: lastSegment(v.name),
      state: v.state || 'STATE_UNSPECIFIED',
      createTime: v.createTime || null,
      destroyTime: v.destroyTime || null,
    }))
    .sort((a, b) => Number(b.version) - Number(a.version));
}

export const getPlatformSecretVault = callable(async request => {
  requireSuperAdmin(request);
  const listed = await secretManagerJson(parent() + '/secrets?pageSize=200');
  const rows = [];
  for (const item of listed.secrets || []) {
    if (!item.name) continue;
    const id = lastSegment(item.name);
    const versions = await listVersionsFor(item.name);
    rows.push({
      id,
      labels: item.labels || {},
      createTime: item.createTime || null,
      latestVersion: versions[0] || null,
      versions: versions.slice(0, 20),
      replication: item.replication?.automatic ? 'automatic' : 'user-managed',
    });
  }
  rows.sort((a, b) => a.id.localeCompare(b.id));
  return {
    projectId: projectId(),
    secrets: rows,
    valuesVisible: false,
    policy: 'Secret values are write-only in the admin console and are never returned by this API.',
  };
});

export const createPlatformSecret = callable(async request => {
  const actor = requireSuperAdmin(request, {recentSeconds: 600});
  const input = z.object({
    id: secretId,
    value: z.string().min(1).max(65536),
    labels: z.record(z.string().max(63)).default({}),
  }).strict().parse(request.data);

  const name = resource(input.id);
  try {
    await secretManagerJson(name);
    throw new HttpsError('already-exists', 'Secret already exists; rotate it instead');
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    if (Number(error?.code) !== 404) throw error;
  }

  await secretManagerJson(parent() + '/secrets?secretId=' + encodeURIComponent(input.id), {
    method: 'POST',
    body: {replication: {automatic: {}}, labels: input.labels},
  });
  const version = await secretManagerJson(name + ':addVersion', {
    method: 'POST',
    body: {payload: {data: Buffer.from(input.value, 'utf8').toString('base64')}},
  });
  await audit(actor, 'secret.create', {
    secretId: input.id,
    version: lastSegment(version.name),
  });
  return {ok: true, id: input.id, version: lastSegment(version.name)};
});

export const rotatePlatformSecret = callable(async request => {
  const actor = requireSuperAdmin(request, {recentSeconds: 600});
  const input = z.object({
    id: secretId,
    value: z.string().min(1).max(65536),
    disablePrevious: z.boolean().default(false),
  }).strict().parse(request.data);
  const name = resource(input.id);
  await secretManagerJson(name);

  const before = await secretManagerJson(name + '/versions?pageSize=100');
  const active = (before.versions || [])
    .filter(v => v.state === 'ENABLED' && lastSegment(v.name) !== '0')
    .sort((a, b) => Number(lastSegment(b.name)) - Number(lastSegment(a.name)));

  const created = await secretManagerJson(name + ':addVersion', {
    method: 'POST',
    body: {payload: {data: Buffer.from(input.value, 'utf8').toString('base64')}},
  });
  const createdVersion = lastSegment(created.name);

  if (input.disablePrevious) {
    for (const previous of active) {
      if (!previous.name || lastSegment(previous.name) === createdVersion) continue;
      await secretManagerJson(previous.name + ':disable', {method: 'POST', body: {}});
    }
  }

  await audit(actor, 'secret.rotate', {
    secretId: input.id,
    version: createdVersion,
    disabledPrevious: input.disablePrevious,
  });
  return {ok: true, id: input.id, version: createdVersion};
});

export const setPlatformSecretVersionState = callable(async request => {
  const actor = requireSuperAdmin(request, {recentSeconds: 300});
  const input = z.object({
    id: secretId,
    version: versionId,
    enabled: z.boolean(),
  }).strict().parse(request.data);
  const name = versionResource(input.id, input.version);
  if (input.enabled) await secretManagerJson(name + ':enable', {method: 'POST', body: {}});
  else await secretManagerJson(name + ':disable', {method: 'POST', body: {}});
  await audit(actor, input.enabled ? 'secret.version.enable' : 'secret.version.disable', {
    secretId: input.id,
    version: input.version,
  });
  return {ok: true};
});

export const destroyPlatformSecretVersion = callable(async request => {
  const actor = requireSuperAdmin(request, {recentSeconds: 300});
  const input = z.object({
    id: secretId,
    version: versionId,
    confirmation: z.string(),
  }).strict().parse(request.data);
  const expected = `DESTROY ${input.id} VERSION ${input.version}`;
  if (input.confirmation !== expected) {
    throw new HttpsError('failed-precondition', `Type exactly: ${expected}`);
  }
  await secretManagerJson(versionResource(input.id, input.version) + ':destroy', {method: 'POST', body: {}});
  await audit(actor, 'secret.version.destroy', {
    secretId: input.id,
    version: input.version,
  });
  return {ok: true};
});

export const deletePlatformSecret = callable(async request => {
  const actor = requireSuperAdmin(request, {recentSeconds: 300, rootOnly: true});
  const input = z.object({
    id: secretId,
    confirmation: z.string(),
  }).strict().parse(request.data);
  const expected = `DELETE SECRET ${input.id}`;
  if (input.confirmation !== expected) {
    throw new HttpsError('failed-precondition', `Type exactly: ${expected}`);
  }
  await secretManagerJson(resource(input.id), {method: 'DELETE'});
  await audit(actor, 'secret.delete', {secretId: input.id});
  return {ok: true};
});

export const revokePlatformUserSessions = callable(async request => {
  const actor = requireSuperAdmin(request, {recentSeconds: 300});
  const input = z.object({uid: z.string().min(1).max(128)}).strict().parse(request.data);
  const target = await auth.getUser(input.uid);
  if (target.email?.toLowerCase() === 'chrisndirangu54@gmail.com' && actor.uid !== input.uid) {
    throw new HttpsError('permission-denied', 'Only the root account may revoke its own sessions');
  }
  await auth.revokeRefreshTokens(input.uid);
  await audit(actor, 'user.sessions.revoke', {
    targetUid: input.uid,
    targetEmail: target.email || '',
  });
  return {ok: true};
});

export const emergencyDisablePlatformUser = callable(async request => {
  const actor = requireSuperAdmin(request, {recentSeconds: 300});
  const input = z.object({
    uid: z.string().min(1).max(128),
    confirmation: z.string(),
  }).strict().parse(request.data);
  const target = await auth.getUser(input.uid);
  if (target.email?.toLowerCase() === 'chrisndirangu54@gmail.com') {
    throw new HttpsError('permission-denied', 'The protected root account cannot be emergency-disabled');
  }
  const expected = `LOCK ${target.email || input.uid}`;
  if (input.confirmation !== expected) {
    throw new HttpsError('failed-precondition', `Type exactly: ${expected}`);
  }
  await auth.updateUser(input.uid, {disabled: true});
  await auth.revokeRefreshTokens(input.uid);
  await audit(actor, 'user.emergency_disable', {
    targetUid: input.uid,
    targetEmail: target.email || '',
  });
  return {ok: true};
});
