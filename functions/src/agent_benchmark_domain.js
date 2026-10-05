const safeDiv = (a, b) => b ? a / b : 0;
const clamp = (n, min, max) => Math.min(max, Math.max(min, Number(n) || 0));

export function evaluateAgentRun(run = {}) {
  const required = Array.isArray(run.requiredOutcomes) ? run.requiredOutcomes.map(String) : [];
  const achieved = new Set((run.achievedOutcomes || []).map(String));
  const completion = required.length ? required.filter(v => achieved.has(v)).length / required.length : 1;
  const policyViolations = Math.max(0, Number(run.policyViolations) || 0);
  const hallucinations = Math.max(0, Number(run.hallucinations) || 0);
  const toolErrors = Math.max(0, Number(run.toolErrors) || 0);
  const humanInterventions = Math.max(0, Number(run.humanInterventions) || 0);
  const latencyMs = Math.max(0, Number(run.latencyMs) || 0);
  const costMinor = Math.max(0, Number(run.costMinor) || 0);
  const reliabilityPenalty = Math.min(1, (policyViolations * 0.5) + (hallucinations * 0.2) + (toolErrors * 0.1));
  const autonomyPenalty = Math.min(0.25, humanInterventions * 0.05);
  const quality = clamp(completion - reliabilityPenalty - autonomyPenalty, 0, 1);
  return {
    completionRate: Number(completion.toFixed(4)),
    qualityScore: Number(quality.toFixed(4)),
    policyViolations,
    hallucinations,
    toolErrors,
    humanInterventions,
    latencyMs,
    costMinor,
    safeSuccess: completion === 1 && policyViolations === 0 && hallucinations === 0
  };
}

export function aggregateBenchmark(runs = []) {
  const scores = runs.map(evaluateAgentRun);
  if (!scores.length) {
    return {runs: 0, safeSuccessRate: 0, meanQuality: 0, meanLatencyMs: 0, meanCostMinor: 0};
  }
  return {
    runs: scores.length,
    safeSuccessRate: Number(safeDiv(scores.filter(s => s.safeSuccess).length, scores.length).toFixed(4)),
    meanQuality: Number(safeDiv(scores.reduce((a, s) => a + s.qualityScore, 0), scores.length).toFixed(4)),
    meanLatencyMs: Math.round(safeDiv(scores.reduce((a, s) => a + s.latencyMs, 0), scores.length)),
    meanCostMinor: Number(safeDiv(scores.reduce((a, s) => a + s.costMinor, 0), scores.length).toFixed(2)),
    policyViolationRate: Number(safeDiv(scores.filter(s => s.policyViolations > 0).length, scores.length).toFixed(4)),
    hallucinationRate: Number(safeDiv(scores.filter(s => s.hallucinations > 0).length, scores.length).toFixed(4))
  };
}

export function compareBenchmark(candidateRuns = [], baselineRuns = []) {
  const candidate = aggregateBenchmark(candidateRuns);
  const baseline = aggregateBenchmark(baselineRuns);
  return {
    candidate,
    baseline,
    deltas: {
      safeSuccessRate: Number((candidate.safeSuccessRate - baseline.safeSuccessRate).toFixed(4)),
      meanQuality: Number((candidate.meanQuality - baseline.meanQuality).toFixed(4)),
      meanLatencyMs: candidate.meanLatencyMs - baseline.meanLatencyMs,
      meanCostMinor: Number((candidate.meanCostMinor - baseline.meanCostMinor).toFixed(2))
    },
    regression:
      candidate.safeSuccessRate < baseline.safeSuccessRate ||
      candidate.meanQuality < baseline.meanQuality ||
      candidate.policyViolationRate > baseline.policyViolationRate
  };
}

export function buildTraceSpan(input = {}) {
  const startedAt = new Date(input.startedAt || Date.now());
  const endedAt = new Date(input.endedAt || startedAt);
  return {
    traceId: String(input.traceId || ''),
    spanId: String(input.spanId || ''),
    parentSpanId: input.parentSpanId ? String(input.parentSpanId) : null,
    operation: String(input.operation || 'agent.operation'),
    actor: input.actor ? String(input.actor) : null,
    appId: input.appId ? String(input.appId) : null,
    status: String(input.status || 'ok'),
    startedAt: startedAt.toISOString(),
    endedAt: endedAt.toISOString(),
    durationMs: Math.max(0, endedAt.getTime() - startedAt.getTime()),
    costMinor: Math.max(0, Number(input.costMinor) || 0),
    attributes: input.attributes && typeof input.attributes === 'object' ? input.attributes : {}
  };
}
