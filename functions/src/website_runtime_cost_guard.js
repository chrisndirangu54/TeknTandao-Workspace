import './index.js';
import {randomUUID} from 'node:crypto';
import {FieldValue, getFirestore} from 'firebase-admin/firestore';
import {HttpsError, onCall} from 'firebase-functions/v2/https';
import {defineSecret} from 'firebase-functions/params';
import {identifier} from './domain.js';
import {analyticsSample, defaultFirebaseCostPolicy, validateFirebaseCostPolicy} from './firebase_finops_domain.js';
import {validateWebsiteDocument} from './website_builder_domain.js';
import {
  assignExperimentVariant,
  hashVisitor,
  normalizeWebsiteDomain,
  signAnalyticsToken,
  validateWebsiteExperiment,
} from './website_builder_advanced_domain.js';

const db = getFirestore();
const region = 'europe-west1';
const analyticsSigningKey = defineSecret('WEBSITE_ANALYTICS_SIGNING_KEY');
const stamp = () => FieldValue.serverTimestamp();
const orgRoot = orgId => db.doc(`organizations/${identifier(orgId)}`);

const siteCache = new Map();
const domainCache = new Map();
const experimentCache = new Map();
const versionCache = new Map();
const policyCache = new Map();
const SITE_TTL_MS = 30_000;
const DOMAIN_TTL_MS = 60_000;
const EXPERIMENT_TTL_MS = 30_000;
const VERSION_TTL_MS = 60_000;
const POLICY_TTL_MS = 300_000;

function cached(map, key) {
  const item = map.get(key);
  if (!item || item.expiresAt <= Date.now()) {
    if (item) map.delete(key);
    return null;
  }
  return item.value;
}

function put(map, key, value, ttl) {
  map.set(key, {value, expiresAt: Date.now() + ttl});
  return value;
}

function experimentIsLive(experiment, path) {
  if (experiment.status !== 'active') return false;
  if (experiment.path !== '*' && experiment.path !== path) return false;
  const now = Date.now();
  if (experiment.startsAt && Date.parse(experiment.startsAt) > now) return false;
  if (experiment.endsAt && Date.parse(experiment.endsAt) <= now) return false;
  return true;
}

async function resolvePublicId(publicId, host) {
  if (publicId) return identifier(publicId);
  if (!host) throw new HttpsError('invalid-argument', 'publicId or host is required');
  const domain = normalizeWebsiteDomain(host);
  const existing = cached(domainCache, domain);
  if (existing) return existing;
  const snapshot = await db.doc(`publishedWebsiteDomains/${domain}`).get();
  if (!snapshot.exists || snapshot.data().active === false) {
    throw new HttpsError('not-found', 'Published website domain not found');
  }
  return put(domainCache, domain, identifier(snapshot.data().publicId), DOMAIN_TTL_MS);
}

async function resolveSite(publicId) {
  const existing = cached(siteCache, publicId);
  if (existing) return existing;
  const [siteSnapshot, ownerSnapshot] = await Promise.all([
    db.doc(`publishedWebsiteSites/${publicId}`).get(),
    db.doc(`websitePublicSiteOwners/${publicId}`).get(),
  ]);
  if (!siteSnapshot.exists || !ownerSnapshot.exists) {
    throw new HttpsError('not-found', 'Published website not found');
  }
  const owner = ownerSnapshot.data();
  return put(siteCache, publicId, {
    site: siteSnapshot.data(),
    owner,
    org: orgRoot(owner.orgId),
  }, SITE_TTL_MS);
}

async function loadPolicy(org) {
  const existing = cached(policyCache, org.id);
  if (existing) return existing;
  const snapshot = await org.collection('firebaseFinOps').doc('policy').get();
  const policy = validateFirebaseCostPolicy(
    snapshot.exists ? snapshot.data() : defaultFirebaseCostPolicy,
  );
  return put(policyCache, org.id, policy, POLICY_TTL_MS);
}

async function loadExperiments(org, projectId) {
  const key = `${org.id}:${projectId}`;
  const existing = cached(experimentCache, key);
  if (existing) return existing;
  const snapshot = await org.collection('websiteExperiments')
    .where('projectId', '==', projectId)
    .limit(20)
    .get();
  const experiments = snapshot.docs.map(doc => validateWebsiteExperiment(doc.data()));
  return put(experimentCache, key, experiments, EXPERIMENT_TTL_MS);
}

async function loadVersion(org, projectId, version) {
  const key = `${org.id}:${projectId}:${version}`;
  const existing = cached(versionCache, key);
  if (existing) return existing;
  const snapshot = await org.collection('websiteVersions').doc(`${projectId}_${version}`).get();
  if (!snapshot.exists) return null;
  const document = validateWebsiteDocument(snapshot.data().document);
  return put(versionCache, key, document, VERSION_TTL_MS);
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

export const resolveCostAwarePublishedWebsiteExperience = onCall({
  region,
  secrets: [analyticsSigningKey],
}, async request => {
  try {
    const publicId = await resolvePublicId(request.data.publicId, request.data.host);
    const resolved = await resolveSite(publicId);
    const visitorHash = hashVisitor(
      analyticsSigningKey.value(),
      request.data.visitorId || randomUUID(),
    );
    const path = String(request.data.path || '/').slice(0, 160);
    const policy = await loadPolicy(resolved.org);
    const experiments = await loadExperiments(resolved.org, resolved.owner.projectId);

    let document = validateWebsiteDocument(resolved.site.document);
    let selected = null;
    let selectedExperiment = null;
    for (const experiment of experiments) {
      if (!experimentIsLive(experiment, path)) continue;
      const variant = assignExperimentVariant(experiment, visitorHash);
      if (!variant) continue;
      const variantDocument = await loadVersion(
        resolved.org,
        experiment.projectId,
        variant.version,
      );
      if (!variantDocument) continue;
      document = variantDocument;
      selected = variant;
      selectedExperiment = experiment;
      break;
    }

    // Page views and experiment exposures are high-volume, non-financial
    // telemetry. Deterministic sampling cuts Firestore writes while weighted
    // counters retain a useful aggregate estimate. Conversion events remain
    // full-fidelity in recordWebsiteConversion.
    const sample = analyticsSample(visitorHash, policy.websiteViewSampleRate);
    if (sample.sampled) {
      const day = todayKey();
      await resolved.org.collection('websiteAnalyticsDaily')
        .doc(`${publicId}_${day}`)
        .set({
          publicId,
          day,
          views: FieldValue.increment(sample.weight),
          sampledViewEvents: FieldValue.increment(1),
          viewSampleRate: policy.websiteViewSampleRate,
          updatedAt: stamp(),
        }, {merge: true});
      if (selectedExperiment && selected) {
        await resolved.org.collection('websiteExperimentStats')
          .doc(`${selectedExperiment.experimentId}_${selected.id}_${day}`)
          .set({
            experimentId: selectedExperiment.experimentId,
            variantId: selected.id,
            day,
            exposures: FieldValue.increment(sample.weight),
            sampledExposureEvents: FieldValue.increment(1),
            exposureSampleRate: policy.websiteViewSampleRate,
            updatedAt: stamp(),
          }, {merge: true});
      }
    }

    const token = signAnalyticsToken(analyticsSigningKey.value(), {
      publicId,
      orgId: resolved.owner.orgId,
      projectId: resolved.owner.projectId,
      experimentId: selectedExperiment?.experimentId || null,
      variantId: selected?.id || null,
      goals: selectedExperiment?.goals || ['conversion', 'form_submit', 'cta_click'],
      visitorHash,
      exp: Date.now() + 24 * 60 * 60 * 1000,
    });

    return {
      publicId,
      document,
      version: selected?.version || resolved.site.version,
      experimentId: selectedExperiment?.experimentId || null,
      variantId: selected?.id || null,
      exposureToken: token,
      analyticsSampleRate: policy.websiteViewSampleRate,
    };
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    throw new HttpsError(
      'failed-precondition',
      String(error?.message || 'Website runtime resolution failed'),
    );
  }
});
