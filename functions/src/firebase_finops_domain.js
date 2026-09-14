const integer = (value, label, min, max) => {
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new Error(`Invalid ${label}`);
  }
  return value;
};

const number = (value, label, min, max) => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
    throw new Error(`Invalid ${label}`);
  }
  return value;
};

export const defaultFirebaseCostPolicy = Object.freeze({
  maxLiveDocsPerListener: 200,
  readCacheSeconds: 20,
  dailyReadBudget: 250000,
  dailyWriteBudget: 75000,
  dailyDeleteBudget: 10000,
  dailyFunctionCallBudget: 100000,
  softLimitPercent: 80,
  hardLimitPercent: 100,
  enableReadCaching: true,
  enableSharedListeners: true,
  enableNoopProjectionSuppression: true,
  websiteViewSampleRate: 0.25,
});

export function validateFirebaseCostPolicy(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('Invalid Firebase cost policy');
  }
  return {
    maxLiveDocsPerListener: integer(
      input.maxLiveDocsPerListener ?? defaultFirebaseCostPolicy.maxLiveDocsPerListener,
      'live document limit',
      25,
      1000,
    ),
    readCacheSeconds: integer(
      input.readCacheSeconds ?? defaultFirebaseCostPolicy.readCacheSeconds,
      'read cache seconds',
      0,
      600,
    ),
    dailyReadBudget: integer(
      input.dailyReadBudget ?? defaultFirebaseCostPolicy.dailyReadBudget,
      'daily read budget',
      1000,
      1000000000,
    ),
    dailyWriteBudget: integer(
      input.dailyWriteBudget ?? defaultFirebaseCostPolicy.dailyWriteBudget,
      'daily write budget',
      100,
      1000000000,
    ),
    dailyDeleteBudget: integer(
      input.dailyDeleteBudget ?? defaultFirebaseCostPolicy.dailyDeleteBudget,
      'daily delete budget',
      0,
      1000000000,
    ),
    dailyFunctionCallBudget: integer(
      input.dailyFunctionCallBudget ?? defaultFirebaseCostPolicy.dailyFunctionCallBudget,
      'daily function call budget',
      100,
      1000000000,
    ),
    softLimitPercent: integer(
      input.softLimitPercent ?? defaultFirebaseCostPolicy.softLimitPercent,
      'soft limit percent',
      50,
      99,
    ),
    hardLimitPercent: integer(
      input.hardLimitPercent ?? defaultFirebaseCostPolicy.hardLimitPercent,
      'hard limit percent',
      100,
      200,
    ),
    enableReadCaching: input.enableReadCaching !== false,
    enableSharedListeners: input.enableSharedListeners !== false,
    enableNoopProjectionSuppression: input.enableNoopProjectionSuppression !== false,
    websiteViewSampleRate: number(
      input.websiteViewSampleRate ?? defaultFirebaseCostPolicy.websiteViewSampleRate,
      'website analytics sample rate',
      0.01,
      1,
    ),
  };
}

export function evaluateFirebaseUsage(policyInput, usage = {}) {
  const policy = validateFirebaseCostPolicy(policyInput);
  const metrics = {
    reads: Math.max(0, Number(usage.reads || 0)),
    writes: Math.max(0, Number(usage.writes || 0)),
    deletes: Math.max(0, Number(usage.deletes || 0)),
    functionCalls: Math.max(0, Number(usage.functionCalls || 0)),
  };
  const ratios = {
    reads: metrics.reads / policy.dailyReadBudget,
    writes: metrics.writes / policy.dailyWriteBudget,
    deletes: policy.dailyDeleteBudget === 0 ? 0 : metrics.deletes / policy.dailyDeleteBudget,
    functionCalls: metrics.functionCalls / policy.dailyFunctionCallBudget,
  };
  const maxRatio = Math.max(...Object.values(ratios));
  const soft = policy.softLimitPercent / 100;
  const hard = policy.hardLimitPercent / 100;
  return {
    policy,
    metrics,
    ratios,
    maxPercent: Math.round(maxRatio * 10000) / 100,
    state: maxRatio >= hard ? 'hard_limit' : maxRatio >= soft ? 'warning' : 'normal',
    recommendations: firebaseCostRecommendations(policy, ratios),
  };
}

export function firebaseCostRecommendations(policyInput, ratios = {}) {
  const policy = validateFirebaseCostPolicy(policyInput);
  const recommendations = [];
  if ((ratios.reads || 0) >= policy.softLimitPercent / 100) {
    recommendations.push('Reduce live-query limits, paginate large collections, and prefer cached callable summaries.');
  }
  if ((ratios.writes || 0) >= policy.softLimitPercent / 100) {
    recommendations.push('Batch non-critical telemetry and suppress no-op projection/analytics writes.');
  }
  if ((ratios.functionCalls || 0) >= policy.softLimitPercent / 100) {
    recommendations.push('Increase read-call TTLs and coalesce identical in-flight callable requests.');
  }
  if (policy.websiteViewSampleRate < 1) {
    recommendations.push(`Public website view analytics are sampled at ${Math.round(policy.websiteViewSampleRate * 100)}%; conversions stay full-fidelity.`);
  }
  if (!recommendations.length) {
    recommendations.push('Current policy is within its configured cost envelope.');
  }
  return recommendations;
}

export function analyticsSample(visitorHash, sampleRate) {
  const rate = number(sampleRate, 'analytics sample rate', 0.01, 1);
  const source = String(visitorHash || '');
  let hash = 2166136261;
  for (let i = 0; i < source.length; i += 1) {
    hash ^= source.charCodeAt(i);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  const fraction = hash / 0xffffffff;
  return {
    sampled: fraction < rate,
    weight: Math.max(1, Math.round(1 / rate)),
  };
}
