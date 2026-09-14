import test from 'node:test';
import assert from 'node:assert/strict';
import {
  analyticsSample,
  defaultFirebaseCostPolicy,
  evaluateFirebaseUsage,
  validateFirebaseCostPolicy,
} from '../src/firebase_finops_domain.js';

test('Firebase cost policy applies bounded production defaults', () => {
  const policy = validateFirebaseCostPolicy({});
  assert.equal(policy.maxLiveDocsPerListener, 200);
  assert.equal(policy.readCacheSeconds, 20);
  assert.equal(policy.websiteViewSampleRate, 0.25);
  assert.equal(policy.enableSharedListeners, true);
});

test('Firebase cost policy rejects unbounded listener settings', () => {
  assert.throws(() => validateFirebaseCostPolicy({maxLiveDocsPerListener: 5000}));
  assert.throws(() => validateFirebaseCostPolicy({readCacheSeconds: 9999}));
  assert.throws(() => validateFirebaseCostPolicy({websiteViewSampleRate: 0}));
});

test('Firebase usage evaluation raises warning and hard-limit states', () => {
  const policy = validateFirebaseCostPolicy({
    dailyReadBudget: 1000,
    dailyWriteBudget: 1000,
    dailyDeleteBudget: 1000,
    dailyFunctionCallBudget: 1000,
    softLimitPercent: 80,
    hardLimitPercent: 100,
  });
  assert.equal(evaluateFirebaseUsage(policy, {reads: 799}).state, 'normal');
  assert.equal(evaluateFirebaseUsage(policy, {reads: 800}).state, 'warning');
  assert.equal(evaluateFirebaseUsage(policy, {reads: 1000}).state, 'hard_limit');
});

test('analytics sampling is deterministic and weighted', () => {
  const a = analyticsSample('visitor-stable-id', 0.25);
  const b = analyticsSample('visitor-stable-id', 0.25);
  assert.deepEqual(a, b);
  assert.equal(a.weight, 4);
  assert.equal(analyticsSample('visitor-stable-id', 1).sampled, true);
  assert.equal(defaultFirebaseCostPolicy.websiteViewSampleRate, 0.25);
});
