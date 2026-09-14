import './index.js';
import {FieldValue, getFirestore} from 'firebase-admin/firestore';
import {HttpsError, onCall} from 'firebase-functions/v2/https';
import {identifier} from './domain.js';
import {
  defaultFirebaseCostPolicy,
  evaluateFirebaseUsage,
  validateFirebaseCostPolicy,
} from './firebase_finops_domain.js';

const db = getFirestore();
const region = 'europe-west1';
const stamp = () => FieldValue.serverTimestamp();
const orgRoot = orgId => db.doc(`organizations/${identifier(orgId)}`);

function uid(request) {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in first');
  return request.auth.uid;
}

async function authorize(request, ownerOnly = false) {
  const user = uid(request);
  const org = orgRoot(request.data.orgId);
  const member = (await org.collection('members').doc(user).get()).data();
  if (!member || (ownerOnly && member.role !== 'owner')) {
    throw new HttpsError('permission-denied', 'Organization access denied');
  }
  return {org, user, member};
}

function callable(handler) {
  return onCall({region}, async request => {
    try {
      return await handler(request);
    } catch (error) {
      if (error instanceof HttpsError) throw error;
      throw new HttpsError(
        'failed-precondition',
        String(error?.message || 'Firebase FinOps operation failed').slice(0, 1200),
      );
    }
  });
}

async function loadPolicy(org) {
  const snapshot = await org.collection('firebaseFinOps').doc('policy').get();
  return validateFirebaseCostPolicy(
    snapshot.exists ? snapshot.data() : defaultFirebaseCostPolicy,
  );
}

export const getFirebaseCostPolicy = callable(async request => {
  const {org} = await authorize(request);
  const policy = await loadPolicy(org);
  return {
    policy,
    effectiveClientDefaults: {
      maxLiveDocsPerListener: policy.maxLiveDocsPerListener,
      readCacheSeconds: policy.readCacheSeconds,
      sharedListeners: policy.enableSharedListeners,
      persistentLocalCache: true,
    },
  };
});

export const saveFirebaseCostPolicy = callable(async request => {
  const {org, user} = await authorize(request, true);
  const policy = validateFirebaseCostPolicy(request.data.policy);
  await org.collection('firebaseFinOps').doc('policy').set({
    ...policy,
    updatedBy: user,
    updatedAt: stamp(),
  }, {merge: true});
  return {policy};
});

export const getFirebaseFinOpsOverview = callable(async request => {
  const {org} = await authorize(request, true);
  const policy = await loadPolicy(org);

  // These are deliberately aggregate count queries instead of full collection
  // scans. They are diagnostic signals, not a replacement for Cloud Billing
  // export or the Firebase usage console.
  const names = [
    'businessGraphNodes',
    'businessGraphEdges',
    'websiteAnalyticsDaily',
    'websiteProjectEvents',
    'websiteFormSubmissions',
    'websiteFormSpam',
    'agentAudit',
    'automationRuns',
  ];
  const snapshots = await Promise.all(
    names.map(name => org.collection(name).count().get()),
  );
  const collectionCounts = {};
  names.forEach((name, index) => {
    collectionCounts[name] = snapshots[index].data().count;
  });

  const suppliedUsage = request.data.usage && typeof request.data.usage === 'object'
    ? request.data.usage
    : {};
  const evaluation = evaluateFirebaseUsage(policy, suppliedUsage);

  return {
    policy,
    evaluation,
    collectionCounts,
    mitigations: {
      boundedLiveQueries: true,
      sharedRefCountedListeners: true,
      callableReadCache: true,
      inflightReadDeduplication: true,
      persistentClientCache: true,
      mutationCacheInvalidation: true,
      noopBusinessGraphProjectionSuppression: true,
      sampledPublicViewAnalytics: policy.websiteViewSampleRate < 1,
      conversionAnalyticsFullFidelity: true,
      rawBillingSource: 'Use Google Cloud Billing export / Firebase usage metrics for invoice-grade cost data.',
    },
    generatedAt: Date.now(),
  };
});
