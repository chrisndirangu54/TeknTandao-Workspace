import './index.js';
import {createHash, randomUUID} from 'node:crypto';
import {getApp} from 'firebase-admin/app';
import {FieldValue, Timestamp, getFirestore} from 'firebase-admin/firestore';
import {getStorage} from 'firebase-admin/storage';
import {HttpsError, onCall} from 'firebase-functions/v2/https';
import {onDocumentCreated} from 'firebase-functions/v2/firestore';
import {onSchedule} from 'firebase-functions/v2/scheduler';
import {defineSecret} from 'firebase-functions/params';
import {canAccess, identifier, textValue} from './domain.js';
import {verifyPaystack} from './providers.js';
import {validateWebsiteDocument, validateWebsiteNode, websiteDigest} from './website_builder_domain.js';
import {
  assignExperimentVariant,
  cloudflareDnsRecord,
  derivePluginInstallToken,
  hashVisitor,
  mergeWebsiteCrdtOps,
  normalizeWebsiteDomain,
  publicCmsEntry,
  replayWebsiteCrdtOps,
  scoreFormSpam,
  signAnalyticsToken,
  validateAssetUploadRequest,
  validateCmsCollection,
  validateCmsEntry,
  validateCrdtOperation,
  validatePayoutProfile,
  validatePluginManifest,
  validatePluginResponse,
  validatePublicFormValues,
  validateWebsiteExperiment,
  verifyAnalyticsToken
} from './website_builder_advanced_domain.js';

const db = getFirestore();
const region = 'europe-west1';
const websiteAppId = 'mc14_website_builder';
const paystackSecret = defineSecret('PAYSTACK_SECRET_KEY');
const cloudflareToken = defineSecret('CLOUDFLARE_API_TOKEN');
const turnstileSecret = defineSecret('TURNSTILE_SECRET_KEY');
const analyticsSigningKey = defineSecret('WEBSITE_ANALYTICS_SIGNING_KEY');
const pluginSigningSecret = defineSecret('WEBSITE_PLUGIN_SIGNING_SECRET');
const stamp = () => FieldValue.serverTimestamp();
const orgRoot = orgId => db.doc(`organizations/${identifier(orgId)}`);
const publicSiteRef = publicId => db.doc(`publishedWebsiteSites/${identifier(publicId)}`);
const publicOwnerRef = publicId => db.doc(`websitePublicSiteOwners/${identifier(publicId)}`);
const publicDomainRef = domain => db.doc(`publishedWebsiteDomains/${normalizeWebsiteDomain(domain)}`);
const pluginRef = pluginId => db.doc(`websitePlugins/${identifier(pluginId)}`);

function uid(request) {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in first');
  return request.auth.uid;
}

async function authorize(request, {ownerOnly = false} = {}) {
  const user = uid(request);
  const org = orgRoot(request.data.orgId);
  const member = (await org.collection('members').doc(user).get()).data();
  if (!member || (ownerOnly && member.role !== 'owner')) throw new HttpsError('permission-denied', 'Organization access denied');
  const installation = (await org.collection('apps').doc(websiteAppId).get()).data();
  if (!canAccess(member, websiteAppId, installation)) throw new HttpsError('permission-denied', 'Website Builder subscription or permission required');
  return {org, user, member};
}

function callable(handler, secrets = []) {
  return onCall({region, secrets}, async request => {
    try { return await handler(request); }
    catch (error) {
      if (error instanceof HttpsError) throw error;
      throw new HttpsError('failed-precondition', String(error?.message || 'Operation failed').slice(0, 1200));
    }
  });
}

async function jsonFetch(url, options = {}) {
  const response = await fetch(url, {...options, signal: AbortSignal.timeout(options.timeoutMs || 20000)});
  let payload = null;
  try { payload = await response.json(); } catch { payload = null; }
  if (!response.ok) {
    const detail = payload?.error?.message || payload?.message || `HTTP ${response.status}`;
    const error = new Error(detail);
    error.status = response.status;
    throw error;
  }
  return payload;
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function findNode(document, nodeId) {
  function walk(node) {
    if (node?.id === nodeId) return node;
    for (const child of node?.children || []) {
      const found = walk(child);
      if (found) return found;
    }
    return null;
  }
  for (const page of document.pages || []) {
    const found = walk(page.root);
    if (found) return found;
  }
  return null;
}

async function resolvePublicSite({publicId, host}) {
  let id = publicId ? identifier(publicId) : null;
  if (!id && host) {
    const domain = normalizeWebsiteDomain(host);
    const mapping = await publicDomainRef(domain).get();
    if (!mapping.exists) throw new HttpsError('not-found', 'Published website domain not found');
    id = identifier(mapping.data().publicId);
  }
  if (!id) throw new HttpsError('invalid-argument', 'publicId or host is required');
  const [site, owner] = await Promise.all([publicSiteRef(id).get(), publicOwnerRef(id).get()]);
  if (!site.exists || !owner.exists) throw new HttpsError('not-found', 'Published website not found');
  return {publicId: id, site: site.data(), owner: owner.data(), org: orgRoot(owner.data().orgId)};
}

// ---------------------------------------------------------------------------
// Automated custom domains: Firebase Hosting owns TLS; Cloudflare can own DNS.
// ---------------------------------------------------------------------------

async function hostingAccessToken() {
  const credential = getApp().options.credential;
  if (!credential?.getAccessToken) throw new Error('Firebase Hosting API credentials are unavailable');
  const token = await credential.getAccessToken();
  if (!token?.access_token) throw new Error('Could not acquire Firebase Hosting API token');
  return token.access_token;
}

function hostingSitePath() {
  const projectId = getApp().options.projectId || process.env.GCLOUD_PROJECT;
  if (!projectId) throw new Error('Firebase project id is unavailable');
  const siteId = process.env.WEBSITE_FIREBASE_HOSTING_SITE_ID || projectId;
  return `projects/${projectId}/sites/${siteId}`;
}

async function fetchHostingCustomDomain(domain) {
  const token = await hostingAccessToken();
  const name = `${hostingSitePath()}/customDomains/${domain}`;
  const response = await fetch(`https://firebasehosting.googleapis.com/v1beta1/${name}`, {
    headers: {Authorization: `Bearer ${token}`},
    signal: AbortSignal.timeout(20000)
  });
  if (response.status === 404) return null;
  const payload = await response.json();
  if (!response.ok) throw new Error(payload?.error?.message || `Firebase Hosting HTTP ${response.status}`);
  return payload;
}

async function createHostingCustomDomain(domain) {
  const token = await hostingAccessToken();
  const parent = hostingSitePath();
  return jsonFetch(`https://firebasehosting.googleapis.com/v1beta1/${parent}/customDomains?customDomainId=${encodeURIComponent(domain)}`, {
    method: 'POST',
    headers: {Authorization: `Bearer ${token}`, 'Content-Type': 'application/json'},
    body: JSON.stringify({certPreference: process.env.WEBSITE_CERT_PREFERENCE || 'DEDICATED'})
  });
}

function desiredHostingDns(domainState) {
  const sets = [
    ...(domainState?.requiredDnsUpdates?.desired || []),
    ...(domainState?.cert?.verification?.dns?.desired || [])
  ];
  const byKey = new Map();
  for (const set of sets) {
    for (const record of set.records || []) {
      if (!['ADD','REMOVE'].includes(record.requiredAction)) continue;
      const clean = cloudflareDnsRecord(record);
      byKey.set(`${clean.requiredAction}:${clean.type}:${clean.name}:${clean.content}`, clean);
    }
  }
  return [...byKey.values()];
}

function cloudflareHeaders(secret) {
  if (!secret) throw new Error('Cloudflare DNS automation is not configured');
  return {Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json'};
}

async function cloudflareRecords(secret, zoneId, record) {
  const query = new URLSearchParams({type: record.type, name: record.name});
  const result = await jsonFetch(`https://api.cloudflare.com/client/v4/zones/${encodeURIComponent(zoneId)}/dns_records?${query}`, {
    headers: cloudflareHeaders(secret)
  });
  if (result?.success !== true) throw new Error('Cloudflare DNS lookup failed');
  return result.result || [];
}

function cloudflareRecordBody(record) {
  if (record.type === 'CAA') {
    const match = record.content.match(/^(\d+)\s+([a-zA-Z0-9_-]+)\s+"?([^"]+)"?$/);
    if (!match) throw new Error(`Unsupported Firebase CAA record ${record.content}`);
    return {type: 'CAA', name: record.name, ttl: 1, data: {flags: Number(match[1]), tag: match[2], value: match[3]}};
  }
  return {type: record.type, name: record.name, content: record.content, ttl: 1, proxied: false};
}

function sameCloudflareContent(existing, record) {
  if (record.type === 'CAA') {
    const body = cloudflareRecordBody(record);
    return Number(existing.data?.flags) === body.data.flags && existing.data?.tag === body.data.tag && existing.data?.value === body.data.value;
  }
  return String(existing.content || '').replace(/\.$/, '').replace(/^"|"$/g, '') === record.content.replace(/\.$/, '').replace(/^"|"$/g, '');
}

async function reconcileCloudflareDns(secret, zoneId, desired) {
  const changes = [];
  for (const record of desired) {
    const existing = await cloudflareRecords(secret, zoneId, record);
    const exact = existing.filter(item => sameCloudflareContent(item, record));
    if (record.requiredAction === 'ADD' && exact.length === 0) {
      const result = await jsonFetch(`https://api.cloudflare.com/client/v4/zones/${encodeURIComponent(zoneId)}/dns_records`, {
        method: 'POST',
        headers: cloudflareHeaders(secret),
        body: JSON.stringify(cloudflareRecordBody(record))
      });
      if (result?.success !== true) throw new Error('Cloudflare DNS create failed');
      changes.push({action: 'ADD', type: record.type, name: record.name});
    }
    if (record.requiredAction === 'REMOVE') {
      for (const item of exact) {
        const result = await jsonFetch(`https://api.cloudflare.com/client/v4/zones/${encodeURIComponent(zoneId)}/dns_records/${encodeURIComponent(item.id)}`, {
          method: 'DELETE',
          headers: cloudflareHeaders(secret)
        });
        if (result?.success !== true) throw new Error('Cloudflare DNS delete failed');
        changes.push({action: 'REMOVE', type: record.type, name: record.name});
      }
    }
  }
  return changes;
}

async function syncDomainRecord(org, domain, secret) {
  const ref = org.collection('websiteDomains').doc(domain);
  const snapshot = await ref.get();
  if (!snapshot.exists) throw new Error('Website domain configuration not found');
  const config = snapshot.data();
  const state = await fetchHostingCustomDomain(domain);
  if (!state) throw new Error('Firebase Hosting custom domain is not provisioned yet');
  const desired = desiredHostingDns(state);
  let dnsChanges = [];
  if (config.dnsProvider === 'cloudflare' && desired.length) {
    dnsChanges = await reconcileCloudflareDns(secret, config.zoneId, desired);
  }
  const certState = state.cert?.state || 'CERT_STATE_UNSPECIFIED';
  const active = state.hostState === 'HOST_ACTIVE' && state.ownershipState === 'OWNERSHIP_ACTIVE' && ['CERT_ACTIVE','CERT_EXPIRING_SOON'].includes(certState);
  await ref.set({
    hostState: state.hostState || null,
    ownershipState: state.ownershipState || null,
    certState,
    active,
    reconciling: state.reconciling === true,
    requiredDns: desired,
    issues: state.issues || state.cert?.issues || [],
    lastDnsChanges: dnsChanges,
    checkedAt: stamp()
  }, {merge: true});
  await publicDomainRef(domain).set({domain, publicId: config.publicId, active, updatedAt: stamp()}, {merge: true});
  return {domain, active, hostState: state.hostState, ownershipState: state.ownershipState, certState, requiredDns: desired, dnsChanges};
}

export const provisionWebsiteCustomDomain = callable(async request => {
  const {org, user} = await authorize(request, {ownerOnly: true});
  const projectId = identifier(request.data.projectId);
  const domain = normalizeWebsiteDomain(request.data.domain);
  const dnsProvider = String(request.data.dnsProvider || 'manual');
  if (!['manual','cloudflare'].includes(dnsProvider)) throw new Error('Unsupported DNS provider');
  const project = await org.collection('websiteProjects').doc(projectId).get();
  if (!project.exists || !project.data().publishedVersion) throw new Error('Publish the website before connecting a custom domain');
  const zoneId = dnsProvider === 'cloudflare' ? identifier(request.data.zoneId) : null;
  const existing = await fetchHostingCustomDomain(domain);
  if (!existing) await createHostingCustomDomain(domain);
  await org.collection('websiteDomains').doc(domain).set({
    domain,
    projectId,
    publicId: project.data().publicId,
    dnsProvider,
    zoneId,
    requestedBy: user,
    createdAt: stamp(),
    updatedAt: stamp(),
    active: false
  }, {merge: true});
  await publicDomainRef(domain).set({domain, publicId: project.data().publicId, active: false, updatedAt: stamp()}, {merge: true});
  let state = await fetchHostingCustomDomain(domain);
  if (!state) return {domain, state: 'provisioning'};
  const desired = desiredHostingDns(state);
  const dnsChanges = dnsProvider === 'cloudflare' ? await reconcileCloudflareDns(cloudflareToken.value(), zoneId, desired) : [];
  return {domain, state: 'provisioning', dnsProvider, requiredDns: desired, dnsChanges};
}, [cloudflareToken]);

export const syncWebsiteCustomDomain = callable(async request => {
  const {org} = await authorize(request, {ownerOnly: true});
  const domain = normalizeWebsiteDomain(request.data.domain);
  return syncDomainRecord(org, domain, cloudflareToken.value());
}, [cloudflareToken]);

export const removeWebsiteCustomDomain = callable(async request => {
  const {org} = await authorize(request, {ownerOnly: true});
  const domain = normalizeWebsiteDomain(request.data.domain);
  const token = await hostingAccessToken();
  const name = `${hostingSitePath()}/customDomains/${domain}`;
  const response = await fetch(`https://firebasehosting.googleapis.com/v1beta1/${name}`, {
    method: 'DELETE',
    headers: {Authorization: `Bearer ${token}`},
    signal: AbortSignal.timeout(20000)
  });
  if (!response.ok && response.status !== 404) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload?.error?.message || `Firebase Hosting HTTP ${response.status}`);
  }
  await Promise.all([
    org.collection('websiteDomains').doc(domain).delete(),
    publicDomainRef(domain).delete()
  ]);
  return {domain, removed: true};
});

export const syncWebsiteDomains = onSchedule({schedule: 'every 30 minutes', region, secrets: [cloudflareToken]}, async () => {
  const snapshots = await db.collectionGroup('websiteDomains').limit(100).get();
  for (const domainDoc of snapshots.docs) {
    try {
      const org = domainDoc.ref.parent.parent;
      if (org) await syncDomainRecord(org, domainDoc.id, cloudflareToken.value());
    } catch (error) {
      console.error('Website domain sync failed', domainDoc.ref.path, error);
    }
  }
});

// ---------------------------------------------------------------------------
// Immutable/cached asset upload pipeline using signed Cloud Storage PUT URLs.
// ---------------------------------------------------------------------------

function websiteAssetBucket() {
  const name = process.env.WEBSITE_ASSET_BUCKET || getApp().options.storageBucket;
  if (!name) throw new Error('Configure WEBSITE_ASSET_BUCKET or Firebase storageBucket');
  return getStorage().bucket(name);
}

function extensionFor(contentType) {
  return ({
    'image/jpeg':'jpg','image/png':'png','image/webp':'webp','image/gif':'gif','image/avif':'avif',
    'video/mp4':'mp4','video/webm':'webm','application/pdf':'pdf','font/woff2':'woff2'
  })[contentType] || 'bin';
}

export const createWebsiteAssetUpload = callable(async request => {
  const {org, user} = await authorize(request);
  const asset = validateAssetUploadRequest(request.data);
  const project = await org.collection('websiteProjects').doc(asset.projectId).get();
  if (!project.exists) throw new Error('Website project not found');
  const uploadId = identifier(`asset_${randomUUID()}`);
  const ext = extensionFor(asset.contentType);
  const tempPath = `website-upload-staging/${org.id}/${asset.projectId}/${uploadId}.${ext}`;
  const bucket = websiteAssetBucket();
  const file = bucket.file(tempPath);
  const expiresAt = Date.now() + 15 * 60 * 1000;
  const [uploadUrl] = await file.getSignedUrl({version: 'v4', action: 'write', expires: expiresAt, contentType: asset.contentType});
  await org.collection('websiteAssetUploads').doc(uploadId).set({
    uploadId,
    ...asset,
    tempPath,
    createdBy: user,
    state: 'awaiting_upload',
    expiresAt: Timestamp.fromMillis(expiresAt),
    createdAt: stamp()
  });
  return {uploadId, uploadUrl, method: 'PUT', headers: {'Content-Type': asset.contentType}, expiresAt};
});

export const finalizeWebsiteAssetUpload = callable(async request => {
  const {org, user} = await authorize(request);
  const uploadId = identifier(request.data.uploadId);
  const ref = org.collection('websiteAssetUploads').doc(uploadId);
  const snapshot = await ref.get();
  if (!snapshot.exists) throw new Error('Asset upload not found');
  const upload = snapshot.data();
  if (upload.expiresAt.toMillis() < Date.now()) throw new Error('Asset upload expired');
  const bucket = websiteAssetBucket();
  const staging = bucket.file(upload.tempPath);
  const [metadata] = await staging.getMetadata();
  const actualSize = Number(metadata.size);
  if (!Number.isSafeInteger(actualSize) || actualSize <= 0 || actualSize > upload.size || metadata.contentType !== upload.contentType) {
    await staging.delete({ignoreNotFound: true});
    throw new Error('Uploaded asset does not match the signed upload request');
  }
  const token = randomUUID();
  const ext = extensionFor(upload.contentType);
  const assetId = identifier(`asset_${randomUUID()}`);
  const finalPath = `website-assets/${org.id}/${upload.projectId}/${assetId}.${ext}`;
  await staging.move(finalPath);
  const finalFile = bucket.file(finalPath);
  await finalFile.setMetadata({
    contentType: upload.contentType,
    cacheControl: 'public,max-age=31536000,immutable',
    contentDisposition: upload.contentType === 'application/pdf' ? 'attachment' : 'inline',
    metadata: {firebaseStorageDownloadTokens: token, tekntandaoAssetId: assetId}
  });
  const url = `https://firebasestorage.googleapis.com/v0/b/${encodeURIComponent(bucket.name)}/o/${encodeURIComponent(finalPath)}?alt=media&token=${encodeURIComponent(token)}`;
  const assetRecord = {
    assetId,
    projectId: upload.projectId,
    name: upload.name,
    contentType: upload.contentType,
    size: actualSize,
    md5Hash: metadata.md5Hash || null,
    storagePath: finalPath,
    url,
    cacheControl: 'public,max-age=31536000,immutable',
    uploadedBy: user,
    createdAt: stamp()
  };
  await Promise.all([
    org.collection('websiteAssets').doc(assetId).set(assetRecord),
    ref.set({state: 'finalized', assetId, finalizedAt: stamp()}, {merge: true})
  ]);
  return {assetId, url, contentType: upload.contentType, size: actualSize};
});

export const deleteWebsiteAsset = callable(async request => {
  const {org} = await authorize(request, {ownerOnly: true});
  const assetId = identifier(request.data.assetId);
  const ref = org.collection('websiteAssets').doc(assetId);
  const snapshot = await ref.get();
  if (!snapshot.exists) return {assetId, deleted: true};
  await websiteAssetBucket().file(snapshot.data().storagePath).delete({ignoreNotFound: true});
  await ref.delete();
  return {assetId, deleted: true};
});

// ---------------------------------------------------------------------------
// Advanced CMS + public data bindings.
// ---------------------------------------------------------------------------

export const saveWebsiteCmsCollection = callable(async request => {
  const {org, user} = await authorize(request);
  const schema = validateCmsCollection(request.data.collection);
  await org.collection('websiteCmsCollections').doc(schema.collectionId).set({...schema, updatedBy: user, updatedAt: stamp()}, {merge: true});
  return {collection: schema};
});

export const upsertWebsiteCmsEntry = callable(async request => {
  const {org, user} = await authorize(request);
  const collectionId = identifier(request.data.collectionId);
  const collectionRef = org.collection('websiteCmsCollections').doc(collectionId);
  const schemaSnapshot = await collectionRef.get();
  if (!schemaSnapshot.exists) throw new Error('CMS collection not found');
  const values = validateCmsEntry(schemaSnapshot.data(), request.data.values);
  const entryId = identifier(request.data.entryId || randomUUID());
  const published = request.data.published !== false;
  await collectionRef.collection('entries').doc(entryId).set({
    entryId,
    values,
    published,
    updatedBy: user,
    updatedAt: stamp(),
    ...(request.data.entryId ? {} : {createdBy: user, createdAt: stamp()})
  }, {merge: true});
  return {collectionId, entryId, published};
});

export const deleteWebsiteCmsEntry = callable(async request => {
  const {org} = await authorize(request);
  const collectionId = identifier(request.data.collectionId);
  const entryId = identifier(request.data.entryId);
  await org.collection('websiteCmsCollections').doc(collectionId).collection('entries').doc(entryId).delete();
  return {collectionId, entryId, deleted: true};
});

async function cmsRows(org, collectionId, {publicOnly = false, limit = 50} = {}) {
  const collectionRef = org.collection('websiteCmsCollections').doc(collectionId);
  const schemaSnapshot = await collectionRef.get();
  if (!schemaSnapshot.exists) throw new Error('CMS collection not found');
  const schema = validateCmsCollection(schemaSnapshot.data());
  if (publicOnly && !schema.publicRead) throw new Error('CMS collection is private');
  let query = collectionRef.collection('entries');
  if (publicOnly) query = query.where('published', '==', true);
  const snapshots = await query.limit(Math.min(publicOnly ? schema.maxPublicItems : 200, Math.max(1, limit))).get();
  let rows = snapshots.docs.map(doc => ({id: doc.id, ...doc.data().values}));
  if (schema.defaultSort) rows.sort((a, b) => String(a[schema.defaultSort] ?? '').localeCompare(String(b[schema.defaultSort] ?? '')));
  if (publicOnly) rows = rows.map(row => ({id: row.id, ...publicCmsEntry(schema, row)}));
  return {schema, rows};
}

export const queryWebsiteCms = callable(async request => {
  const {org} = await authorize(request);
  const collectionId = identifier(request.data.collectionId);
  return cmsRows(org, collectionId, {limit: Number(request.data.limit) || 100});
});

export const queryPublishedWebsiteCms = onCall({region}, async request => {
  try {
    const resolved = await resolvePublicSite({publicId: request.data.publicId, host: request.data.host});
    const collectionId = identifier(request.data.collectionId);
    const result = await cmsRows(resolved.org, collectionId, {publicOnly: true, limit: Number(request.data.limit) || 50});
    return {publicId: resolved.publicId, collectionId, rows: result.rows};
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    throw new HttpsError('failed-precondition', String(error?.message || 'CMS query failed'));
  }
});

// ---------------------------------------------------------------------------
// Third-party plugin marketplace. Plugin code runs remotely; returned visual
// fragments must pass the same closed JSON-node validator as native content.
// ---------------------------------------------------------------------------

export const publishWebsitePlugin = callable(async request => {
  const {org, user} = await authorize(request, {ownerOnly: true});
  const manifest = validatePluginManifest(request.data.manifest);
  const ref = pluginRef(manifest.pluginId);
  const existing = await ref.get();
  if (existing.exists && existing.data().publisherUid !== user) throw new Error('Plugin id is owned by another publisher');
  await ref.set({
    ...manifest,
    publisherUid: user,
    publisherOrgId: org.id,
    status: 'published',
    installs: existing.data()?.installs || 0,
    updatedAt: stamp(),
    ...(existing.exists ? {} : {createdAt: stamp()})
  }, {merge: true});
  return {plugin: manifest};
});

export const getWebsitePluginMarketplace = callable(async request => {
  uid(request);
  const snapshots = await db.collection('websitePlugins').where('status', '==', 'published').limit(100).get();
  return {plugins: snapshots.docs.map(doc => {
    const item = doc.data();
    return {pluginId: doc.id, name: item.name, publisher: item.publisher, description: item.description, version: item.version, capabilities: item.capabilities, publicRuntime: item.publicRuntime, installs: item.installs || 0};
  })};
});

export const installWebsitePlugin = callable(async request => {
  const {org, user} = await authorize(request, {ownerOnly: true});
  const pluginId = identifier(request.data.pluginId);
  const plugin = await pluginRef(pluginId).get();
  if (!plugin.exists || plugin.data().status !== 'published') throw new Error('Plugin not found');
  const installId = identifier(`install_${randomUUID()}`);
  await org.collection('websitePluginInstalls').doc(pluginId).set({
    pluginId,
    installId,
    version: plugin.data().version,
    capabilities: plugin.data().capabilities,
    active: true,
    installedBy: user,
    installedAt: stamp()
  });
  await pluginRef(pluginId).update({installs: FieldValue.increment(1)});
  return {pluginId, installId, capabilities: plugin.data().capabilities};
});

export const uninstallWebsitePlugin = callable(async request => {
  const {org} = await authorize(request, {ownerOnly: true});
  const pluginId = identifier(request.data.pluginId);
  await org.collection('websitePluginInstalls').doc(pluginId).delete();
  return {pluginId, uninstalled: true};
});

async function invokePluginForOrg(org, pluginId, component, input, capability, secret, context = {}) {
  const [plugin, install] = await Promise.all([
    pluginRef(pluginId).get(),
    org.collection('websitePluginInstalls').doc(pluginId).get()
  ]);
  if (!plugin.exists || plugin.data().status !== 'published' || !install.exists || install.data().active !== true) throw new Error('Plugin is not installed');
  const manifest = validatePluginManifest(plugin.data());
  const granted = install.data().capabilities || [];
  if (!manifest.capabilities.includes(capability) || !granted.includes(capability)) throw new Error('Plugin capability is not granted');
  if (!input || typeof input !== 'object' || Array.isArray(input) || JSON.stringify(input).length > 100000) throw new Error('Plugin input is invalid');
  const token = derivePluginInstallToken(secret, org.id, pluginId, install.data().installId);
  const response = await jsonFetch(manifest.endpoint, {
    method: 'POST',
    headers: {'Content-Type': 'application/json', Authorization: `Bearer ${token}`, 'X-TeknTandao-Plugin': pluginId},
    body: JSON.stringify({pluginId, component: textValue(component || 'default', 100), capability, input, context}),
    timeoutMs: manifest.timeoutMs
  });
  return validatePluginResponse(response);
}

export const invokeWebsitePlugin = callable(async request => {
  const {org, user} = await authorize(request);
  const pluginId = identifier(request.data.pluginId);
  const capability = String(request.data.capability || 'site.data');
  return invokePluginForOrg(org, pluginId, request.data.component, request.data.input || {}, capability, pluginSigningSecret.value(), {authenticated: true, uid: user});
}, [pluginSigningSecret]);

export const resolvePublishedWebsitePlugin = onCall({region, secrets: [pluginSigningSecret]}, async request => {
  try {
    const resolved = await resolvePublicSite({publicId: request.data.publicId, host: request.data.host});
    const pluginId = identifier(request.data.pluginId);
    const plugin = await pluginRef(pluginId).get();
    if (!plugin.exists || plugin.data().publicRuntime !== true) throw new Error('Plugin does not allow public runtime use');
    return invokePluginForOrg(resolved.org, pluginId, request.data.component, request.data.input || {}, 'site.fragment', pluginSigningSecret.value(), {authenticated: false, publicId: resolved.publicId});
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    throw new HttpsError('failed-precondition', String(error?.message || 'Plugin failed'));
  }
});

// ---------------------------------------------------------------------------
// OpSet CRDT collaboration + live presence. Operation-set union is commutative;
// materialization uses deterministic Lamport/actor ordering.
// ---------------------------------------------------------------------------

export const submitWebsiteCrdtOperation = callable(async request => {
  const {org, user} = await authorize(request);
  const projectId = identifier(request.data.projectId);
  const operation = validateCrdtOperation(request.data.operation);
  const projectRef = org.collection('websiteProjects').doc(projectId);
  const stateRef = org.collection('websiteCollaboration').doc(projectId);
  const opRef = stateRef.collection('ops').doc(operation.opId);
  await db.runTransaction(async tx => {
    const [projectSnapshot, stateSnapshot, prior] = await Promise.all([tx.get(projectRef), tx.get(stateRef), tx.get(opRef)]);
    if (!projectSnapshot.exists) throw new Error('Website project not found');
    if (prior.exists) return;
    const epoch = stateSnapshot.exists ? stateSnapshot.data().epoch : 1;
    if (operation.epoch !== epoch) throw new Error(`Collaboration epoch changed to ${epoch}; refresh before editing`);
    if (!stateSnapshot.exists) tx.create(stateRef, {projectId, epoch, base: projectSnapshot.data().draft, materializedOpCount: 0, createdAt: stamp()});
    tx.create(opRef, {...operation, projectId, uid: user, createdAt: stamp()});
    tx.set(stateRef.collection('presence').doc(operation.actorId), {actorId: operation.actorId, uid: user, selectedNodeId: request.data.selectedNodeId ? identifier(request.data.selectedNodeId) : null, updatedAt: stamp(), expiresAt: Timestamp.fromMillis(Date.now() + 90000)}, {merge: true});
  });
  return {accepted: true, opId: operation.opId, epoch: operation.epoch};
});

export const materializeWebsiteCrdtOperation = onDocumentCreated({document: 'organizations/{orgId}/websiteCollaboration/{projectId}/ops/{opId}', region, retry: true}, async event => {
  const org = orgRoot(event.params.orgId);
  const projectId = identifier(event.params.projectId);
  const stateRef = org.collection('websiteCollaboration').doc(projectId);
  const projectRef = org.collection('websiteProjects').doc(projectId);
  await db.runTransaction(async tx => {
    const state = await tx.get(stateRef);
    if (!state.exists) return;
    const epoch = state.data().epoch;
    const opsSnapshot = await tx.get(stateRef.collection('ops').where('epoch', '==', epoch).limit(1000));
    if (opsSnapshot.size >= 1000) throw new Error('Collaboration epoch reached 1000 operations; checkpoint it before continuing');
    const operations = mergeWebsiteCrdtOps(opsSnapshot.docs.map(doc => doc.data()));
    const replayed = replayWebsiteCrdtOps(state.data().base, operations);
    const digest = websiteDigest(replayed.document);
    const project = await tx.get(projectRef);
    if (!project.exists) return;
    const opSetHash = createHash('sha256').update(operations.map(op => `${op.actorId}:${op.opId}:${op.clock}`).join('|')).digest('hex');
    if (state.data().materializedOpSetHash === opSetHash) return;
    const revision = (project.data().revision || 0) + 1;
    tx.update(projectRef, {draft: replayed.document, title: replayed.document.title, revision, status: project.data().publishedVersion ? 'modified' : 'draft', collaborationEpoch: epoch, collaborationOps: operations.length, updatedAt: stamp()});
    tx.set(stateRef, {materializedOpCount: operations.length, materializedOpSetHash: opSetHash, unresolvedOpIds: replayed.unresolvedOpIds, materializedAt: stamp()}, {merge: true});
  });
});

export const heartbeatWebsitePresence = callable(async request => {
  const {org, user} = await authorize(request);
  const projectId = identifier(request.data.projectId);
  const actorId = identifier(request.data.actorId);
  const selectedNodeId = request.data.selectedNodeId ? identifier(request.data.selectedNodeId) : null;
  await org.collection('websiteCollaboration').doc(projectId).collection('presence').doc(actorId).set({actorId, uid: user, selectedNodeId, updatedAt: stamp(), expiresAt: Timestamp.fromMillis(Date.now() + 90000)}, {merge: true});
  return {ok: true};
});

export const checkpointWebsiteCollaboration = callable(async request => {
  const {org} = await authorize(request, {ownerOnly: true});
  const projectId = identifier(request.data.projectId);
  const projectRef = org.collection('websiteProjects').doc(projectId);
  const stateRef = org.collection('websiteCollaboration').doc(projectId);
  return db.runTransaction(async tx => {
    const [project, state] = await Promise.all([tx.get(projectRef), tx.get(stateRef)]);
    if (!project.exists) throw new Error('Website project not found');
    const nextEpoch = (state.data()?.epoch || 0) + 1;
    tx.set(stateRef, {projectId, epoch: nextEpoch, base: validateWebsiteDocument(project.data().draft), materializedOpCount: 0, materializedOpSetHash: '', unresolvedOpIds: [], checkpointedAt: stamp()}, {merge: true});
    return {projectId, epoch: nextEpoch};
  });
});

// ---------------------------------------------------------------------------
// Public forms with rate limiting, honeypot heuristics and optional Turnstile.
// ---------------------------------------------------------------------------

async function verifyTurnstile(secret, token, remoteIp) {
  if (!token) return false;
  const body = new URLSearchParams({secret, response: token});
  if (remoteIp) body.set('remoteip', remoteIp);
  const response = await jsonFetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST', headers: {'Content-Type': 'application/x-www-form-urlencoded'}, body
  });
  return response?.success === true;
}

async function consumeFormRateLimit(publicId, ipHash) {
  const bucket = Math.floor(Date.now() / 600000);
  const ref = db.doc(`websiteFormRateLimits/${publicId}_${bucket}_${ipHash.slice(0, 24)}`);
  return db.runTransaction(async tx => {
    const snapshot = await tx.get(ref);
    const count = (snapshot.data()?.count || 0) + 1;
    if (count > 20) throw new HttpsError('resource-exhausted', 'Too many form submissions; retry later');
    tx.set(ref, {publicId, bucket, count, expiresAt: Timestamp.fromMillis((bucket + 2) * 600000)}, {merge: true});
    return count;
  });
}

export const submitPublishedWebsiteForm = onCall({region, secrets: [turnstileSecret, analyticsSigningKey]}, async request => {
  try {
    const resolved = await resolvePublicSite({publicId: request.data.publicId, host: request.data.host});
    const formId = identifier(request.data.formId);
    const document = validateWebsiteDocument(resolved.site.document);
    const form = findNode(document, formId);
    if (!form || form.type !== 'form') throw new Error('Published form not found');
    const values = validatePublicFormValues(request.data.values);
    const remoteIp = request.rawRequest?.ip || request.rawRequest?.headers?.['x-forwarded-for']?.split(',')[0]?.trim() || '';
    const ipHash = hashVisitor(analyticsSigningKey.value(), remoteIp || 'unknown');
    await consumeFormRateLimit(resolved.publicId, ipHash);
    const requireCaptcha = form.props?.requireCaptcha === true;
    const captchaPassed = request.data.captchaToken ? await verifyTurnstile(turnstileSecret.value(), String(request.data.captchaToken), remoteIp) : false;
    if (requireCaptcha && !captchaPassed) throw new HttpsError('permission-denied', 'Human verification failed');
    let spamScore = scoreFormSpam(values, {honeypot: String(request.data.honeypot || ''), elapsedMs: Number(request.data.elapsedMs) || 0});
    if (request.data.captchaToken && !captchaPassed) spamScore = Math.min(100, spamScore + 50);
    const spam = spamScore >= 50;
    const submissionId = identifier(`form_${randomUUID()}`);
    const collection = spam ? 'websiteFormSpam' : 'websiteFormSubmissions';
    await resolved.org.collection(collection).doc(submissionId).set({
      submissionId,
      publicId: resolved.publicId,
      projectId: resolved.owner.projectId,
      formId,
      values,
      spamScore,
      captchaPassed,
      visitorHash: ipHash,
      createdAt: stamp()
    });
    const statsRef = resolved.org.collection('websiteFormStats').doc(`${resolved.publicId}_${formId}_${todayKey()}`);
    await statsRef.set({publicId: resolved.publicId, formId, day: todayKey(), submissions: FieldValue.increment(spam ? 0 : 1), spam: FieldValue.increment(spam ? 1 : 0), updatedAt: stamp()}, {merge: true});
    if (spam) return {ok: true, accepted: false};
    if (request.data.exposureToken) {
      try { await recordConversionInternal(request.data.exposureToken, 'form_submit'); } catch (error) { console.warn('Form conversion attribution failed', error); }
    }
    return {ok: true, accepted: true, submissionId};
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    throw new HttpsError('failed-precondition', String(error?.message || 'Form submission failed'));
  }
});

// ---------------------------------------------------------------------------
// Runtime experimentation + privacy-preserving aggregate conversion analytics.
// ---------------------------------------------------------------------------

function experimentIsLive(experiment, path) {
  if (experiment.status !== 'active') return false;
  if (experiment.path !== '*' && experiment.path !== path) return false;
  const now = Date.now();
  if (experiment.startsAt && Date.parse(experiment.startsAt) > now) return false;
  if (experiment.endsAt && Date.parse(experiment.endsAt) <= now) return false;
  return true;
}

export const saveWebsiteExperiment = callable(async request => {
  const {org, user} = await authorize(request, {ownerOnly: true});
  const experiment = validateWebsiteExperiment(request.data.experiment);
  const project = await org.collection('websiteProjects').doc(experiment.projectId).get();
  if (!project.exists) throw new Error('Website project not found');
  for (const variant of experiment.variants) {
    const version = await org.collection('websiteVersions').doc(`${experiment.projectId}_${variant.version}`).get();
    if (!version.exists) throw new Error(`Published version ${variant.version} does not exist`);
  }
  await org.collection('websiteExperiments').doc(experiment.experimentId).set({...experiment, updatedBy: user, updatedAt: stamp()}, {merge: true});
  return {experiment};
});

export const resolvePublishedWebsiteExperience = onCall({region, secrets: [analyticsSigningKey]}, async request => {
  try {
    const resolved = await resolvePublicSite({publicId: request.data.publicId, host: request.data.host});
    const visitorHash = hashVisitor(analyticsSigningKey.value(), request.data.visitorId || randomUUID());
    const path = String(request.data.path || '/').slice(0, 160);
    const experiments = await resolved.org.collection('websiteExperiments').where('projectId', '==', resolved.owner.projectId).limit(20).get();
    let document = validateWebsiteDocument(resolved.site.document);
    let selected = null;
    let selectedExperiment = null;
    for (const doc of experiments.docs) {
      const experiment = validateWebsiteExperiment(doc.data());
      if (!experimentIsLive(experiment, path)) continue;
      const variant = assignExperimentVariant(experiment, visitorHash);
      if (!variant) continue;
      const version = await resolved.org.collection('websiteVersions').doc(`${experiment.projectId}_${variant.version}`).get();
      if (!version.exists) continue;
      document = validateWebsiteDocument(version.data().document);
      selected = variant;
      selectedExperiment = experiment;
      break;
    }
    const day = todayKey();
    await resolved.org.collection('websiteAnalyticsDaily').doc(`${resolved.publicId}_${day}`).set({publicId: resolved.publicId, day, views: FieldValue.increment(1), updatedAt: stamp()}, {merge: true});
    if (selectedExperiment && selected) {
      await resolved.org.collection('websiteExperimentStats').doc(`${selectedExperiment.experimentId}_${selected.id}_${day}`).set({experimentId: selectedExperiment.experimentId, variantId: selected.id, day, exposures: FieldValue.increment(1), updatedAt: stamp()}, {merge: true});
    }
    const token = signAnalyticsToken(analyticsSigningKey.value(), {
      publicId: resolved.publicId,
      orgId: resolved.owner.orgId,
      projectId: resolved.owner.projectId,
      experimentId: selectedExperiment?.experimentId || null,
      variantId: selected?.id || null,
      goals: selectedExperiment?.goals || ['conversion','form_submit','cta_click'],
      visitorHash,
      exp: Date.now() + 24 * 60 * 60 * 1000
    });
    return {publicId: resolved.publicId, document, version: selected?.version || resolved.site.version, experimentId: selectedExperiment?.experimentId || null, variantId: selected?.id || null, exposureToken: token};
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    throw new HttpsError('failed-precondition', String(error?.message || 'Website runtime resolution failed'));
  }
});

async function recordConversionInternal(token, event) {
  const payload = verifyAnalyticsToken(analyticsSigningKey.value(), token);
  const conversionEvent = identifier(event);
  if (!payload.goals.includes(conversionEvent) && conversionEvent !== 'conversion') throw new Error('Conversion event is not configured for this experience');
  const org = orgRoot(payload.orgId);
  const day = todayKey();
  await org.collection('websiteAnalyticsDaily').doc(`${payload.publicId}_${day}`).set({publicId: payload.publicId, day, conversions: FieldValue.increment(1), [`events_${conversionEvent}`]: FieldValue.increment(1), updatedAt: stamp()}, {merge: true});
  if (payload.experimentId && payload.variantId) {
    await org.collection('websiteExperimentStats').doc(`${payload.experimentId}_${payload.variantId}_${day}`).set({experimentId: payload.experimentId, variantId: payload.variantId, day, conversions: FieldValue.increment(1), [`events_${conversionEvent}`]: FieldValue.increment(1), updatedAt: stamp()}, {merge: true});
  }
  return {ok: true};
}

export const recordWebsiteConversion = onCall({region, secrets: [analyticsSigningKey]}, async request => {
  try { return await recordConversionInternal(request.data.exposureToken, request.data.event || 'conversion'); }
  catch (error) { throw new HttpsError('permission-denied', String(error?.message || 'Invalid conversion')); }
});

export const getWebsiteGrowthAnalytics = callable(async request => {
  const {org} = await authorize(request, {ownerOnly: true});
  const [daily, experiments, forms, domains, assets] = await Promise.all([
    org.collection('websiteAnalyticsDaily').limit(90).get(),
    org.collection('websiteExperimentStats').limit(500).get(),
    org.collection('websiteFormStats').limit(180).get(),
    org.collection('websiteDomains').limit(100).get(),
    org.collection('websiteAssets').limit(100).get()
  ]);
  return {
    daily: daily.docs.map(doc => ({id: doc.id, ...doc.data()})),
    experiments: experiments.docs.map(doc => ({id: doc.id, ...doc.data()})),
    forms: forms.docs.map(doc => ({id: doc.id, ...doc.data()})),
    domains: domains.docs.map(doc => ({id: doc.id, ...doc.data()})),
    assetCount: assets.size
  };
});

// ---------------------------------------------------------------------------
// Automated Paystack creator payouts. Paystack verification remains the source
// of truth; earnings are marked paid only after transfer verification succeeds.
// ---------------------------------------------------------------------------

async function paystack(secret, path, {method = 'GET', body} = {}) {
  const payload = await jsonFetch(`https://api.paystack.co${path}`, {
    method,
    headers: {Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json'},
    ...(body ? {body: JSON.stringify(body)} : {})
  });
  if (payload?.status !== true) throw new Error(payload?.message || 'Paystack request failed');
  return payload.data;
}

export const configureWebsiteCreatorPayout = callable(async request => {
  const {org, user} = await authorize(request, {ownerOnly: true});
  const profile = validatePayoutProfile(request.data.profile);
  const recipient = await paystack(paystackSecret.value(), '/transferrecipient', {
    method: 'POST',
    body: {type: profile.type, name: profile.name, account_number: profile.accountNumber, bank_code: profile.bankCode, currency: profile.currency, description: 'TeknTandao creator marketplace payout'}
  });
  if (!recipient?.recipient_code) throw new Error('Paystack did not return a transfer recipient code');
  await org.collection('websiteCreatorPayoutProfiles').doc('default').set({
    provider: 'paystack',
    recipientCode: recipient.recipient_code,
    recipientType: profile.type,
    currency: profile.currency,
    name: profile.name,
    maskedAccount: profile.accountNumber.length > 4 ? `***${profile.accountNumber.slice(-4)}` : '***',
    bankCode: profile.bankCode,
    minPayoutMinor: profile.minPayoutMinor,
    active: profile.active,
    updatedBy: user,
    updatedAt: stamp()
  }, {merge: true});
  return {provider: 'paystack', recipientCode: recipient.recipient_code, maskedAccount: profile.accountNumber.length > 4 ? `***${profile.accountNumber.slice(-4)}` : '***'};
}, [paystackSecret]);

async function verifyCreatorPayout(org, payout, secret) {
  const verified = await paystack(secret, `/transfer/verify/${encodeURIComponent(payout.reference)}`);
  const state = String(verified?.status || '').toLowerCase();
  const payoutRef = org.collection('websiteCreatorPayouts').doc(payout.reference);
  if (state === 'success') {
    await db.runTransaction(async tx => {
      const fresh = await tx.get(payoutRef);
      if (!fresh.exists || fresh.data().state === 'paid') return;
      for (const earningId of fresh.data().earningIds || []) {
        tx.set(org.collection('websiteTemplateEarnings').doc(earningId), {payoutState: 'paid_out', payoutReference: payout.reference, paidAt: stamp()}, {merge: true});
      }
      tx.update(payoutRef, {state: 'paid', providerState: state, transferCode: verified.transfer_code || null, paidAt: stamp(), verifiedAt: stamp()});
    });
  } else if (['failed','reversed'].includes(state)) {
    await db.runTransaction(async tx => {
      const fresh = await tx.get(payoutRef);
      if (!fresh.exists || ['paid','failed','reversed'].includes(fresh.data().state)) return;
      for (const earningId of fresh.data().earningIds || []) tx.set(org.collection('websiteTemplateEarnings').doc(earningId), {payoutState: 'pending_payout', payoutReference: null}, {merge: true});
      tx.update(payoutRef, {state, providerState: state, verifiedAt: stamp()});
    });
  } else await payoutRef.set({state: 'processing', providerState: state || 'pending', verifiedAt: stamp()}, {merge: true});
  return {reference: payout.reference, state: state || 'pending'};
}

async function startCreatorPayout(org, secret) {
  const profileSnapshot = await org.collection('websiteCreatorPayoutProfiles').doc('default').get();
  if (!profileSnapshot.exists || profileSnapshot.data().active !== true) return {state: 'not_configured'};
  const profile = profileSnapshot.data();
  const pending = await org.collection('websiteTemplateEarnings').where('payoutState', '==', 'pending_payout').limit(200).get();
  const eligible = pending.docs.filter(doc => (doc.data().currency || 'KES') === profile.currency);
  const total = eligible.reduce((sum, doc) => sum + (doc.data().sellerNetMinor || 0), 0);
  if (!eligible.length || total < profile.minPayoutMinor) return {state: 'below_threshold', totalMinor: total, thresholdMinor: profile.minPayoutMinor};
  const reference = identifier(`wp_${randomUUID()}`);
  const payoutRef = org.collection('websiteCreatorPayouts').doc(reference);
  const claimed = await db.runTransaction(async tx => {
    const snapshots = await Promise.all(eligible.map(doc => tx.get(doc.ref)));
    if (snapshots.some(doc => !doc.exists || doc.data().payoutState !== 'pending_payout')) return false;
    for (const doc of snapshots) tx.update(doc.ref, {payoutState: 'payout_processing', payoutReference: reference});
    tx.create(payoutRef, {reference, provider: 'paystack', currency: profile.currency, amountMinor: total, earningIds: eligible.map(doc => doc.id), state: 'initializing', createdAt: stamp()});
    return true;
  });
  if (!claimed) return {state: 'concurrent_claim'};
  try {
    const transfer = await paystack(secret, '/transfer', {
      method: 'POST',
      body: {source: 'balance', amount: total, recipient: profile.recipientCode, reference, reason: 'TeknTandao creator marketplace payout', currency: profile.currency}
    });
    await payoutRef.set({state: 'processing', providerState: transfer.status || 'pending', transferCode: transfer.transfer_code || null, initiatedAt: stamp()}, {merge: true});
    return verifyCreatorPayout(org, {reference}, secret);
  } catch (error) {
    await db.runTransaction(async tx => {
      const payout = await tx.get(payoutRef);
      if (payout.exists && payout.data().state === 'initializing') {
        for (const earningId of payout.data().earningIds || []) tx.set(org.collection('websiteTemplateEarnings').doc(earningId), {payoutState: 'pending_payout', payoutReference: null}, {merge: true});
        tx.update(payoutRef, {state: 'initialization_failed', error: String(error.message || error).slice(0, 500), failedAt: stamp()});
      }
    });
    throw error;
  }
}

export const runWebsiteCreatorPayout = callable(async request => {
  const {org} = await authorize(request, {ownerOnly: true});
  const processing = await org.collection('websiteCreatorPayouts').where('state', '==', 'processing').limit(20).get();
  for (const payout of processing.docs) await verifyCreatorPayout(org, payout.data(), paystackSecret.value());
  return startCreatorPayout(org, paystackSecret.value());
}, [paystackSecret]);

export const getWebsiteCreatorPayoutStatus = callable(async request => {
  const {org} = await authorize(request, {ownerOnly: true});
  const [profile, payouts] = await Promise.all([
    org.collection('websiteCreatorPayoutProfiles').doc('default').get(),
    org.collection('websiteCreatorPayouts').limit(50).get()
  ]);
  return {profile: profile.exists ? profile.data() : null, payouts: payouts.docs.map(doc => ({id: doc.id, ...doc.data()}))};
});

export const processWebsiteCreatorPayouts = onSchedule({schedule: 'every 15 minutes', region, secrets: [paystackSecret]}, async () => {
  const profiles = await db.collectionGroup('websiteCreatorPayoutProfiles').where('active', '==', true).limit(100).get();
  for (const profile of profiles.docs) {
    const org = profile.ref.parent.parent;
    if (!org) continue;
    try {
      const processing = await org.collection('websiteCreatorPayouts').where('state', '==', 'processing').limit(20).get();
      for (const payout of processing.docs) await verifyCreatorPayout(org, payout.data(), paystackSecret.value());
      await startCreatorPayout(org, paystackSecret.value());
    } catch (error) {
      console.error('Creator payout cycle failed', org.path, error);
    }
  }
});

// Backstop for Paystack transfer webhook events. Scheduled verification above
// remains authoritative even if the webhook is delayed or misconfigured.
export const websiteCreatorPayoutWebhook = onCall({region, secrets: [paystackSecret]}, async request => {
  // This callable exists for controlled server-to-server relay deployments.
  // Direct Paystack webhooks should use the existing signed HTTP handlers.
  if (!request.auth?.token?.admin) throw new HttpsError('permission-denied', 'Admin relay only');
  const event = request.data.event;
  const raw = Buffer.from(request.data.rawBody || '', 'base64');
  if (!verifyPaystack(raw, request.data.signature, paystackSecret.value())) throw new HttpsError('permission-denied', 'Invalid Paystack signature');
  if (!['transfer.success','transfer.failed','transfer.reversed'].includes(event)) return {ignored: true};
  return {accepted: true};
}, [paystackSecret]);
