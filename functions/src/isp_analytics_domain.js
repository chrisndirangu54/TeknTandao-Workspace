// Deterministic ISP analytics. These functions never issue network commands.
// Scores are heuristics, not trained models or network reachability guarantees.
export function evaluateLink(sample = {}) {
  const latency = Number(sample.latencyMs);
  const loss = Number(sample.packetLossPct);
  const utilization = Number(sample.utilizationPct);
  const jitter = Number(sample.jitterMs);
  const reasons = [];
  if (!Number.isFinite(latency) || !Number.isFinite(loss) ||
      !Number.isFinite(utilization) || !Number.isFinite(jitter)) {
    return {status: 'insufficient_data', reasons: ['Missing numeric telemetry']};
  }
  if (loss >= 5) reasons.push('critical_packet_loss');
  else if (loss >= 1) reasons.push('elevated_packet_loss');
  if (latency >= 150) reasons.push('high_latency');
  if (jitter >= 45) reasons.push('high_jitter');
  if (utilization >= 90) reasons.push('high_utilization');
  const severe = loss >= 5 || (latency >= 150 && jitter >= 45);
  return {status: severe ? 'critical' : reasons.length ? 'warning' : 'healthy', reasons};
}

export function summarizeTelemetry(items) {
  if (!Array.isArray(items)) throw new TypeError('Expected samples');
  const sampleCount = items.length;
  const statusCount = {healthy: 0, warning: 0, critical: 0, insufficient_data: 0};
  let sumLoss = 0, sumLatency = 0, sumUtilization = 0, valid = 0;
  const bySite = new Map();
  for (const sample of items) {
    const health = evaluateLink(sample);
    statusCount[health.status]++;
    const site = typeof sample.site === 'string' && sample.site.trim()
      ? sample.site.trim() : 'unspecified';
    const group = bySite.get(site) || {site, samples: 0, critical: 0, warning: 0};
    group.samples++;
    if (health.status === 'critical') group.critical++;
    if (health.status === 'warning') group.warning++;
    bySite.set(site, group);
    if (health.status !== 'insufficient_data') {
      valid++;
      sumLoss += sample.packetLossPct;
      sumLatency += sample.latencyMs;
      sumUtilization += sample.utilizationPct;
    }
  }
  const round = n => Math.round(n * 100) / 100;
  return {
    sampleCount,
    validSamples: valid,
    statusCount,
    means: valid ? {
      packetLossPct: round(sumLoss / valid),
      latencyMs: round(sumLatency / valid),
      utilizationPct: round(sumUtilization / valid),
    } : null,
    sites: [...bySite.values()].sort((a, b) => b.critical - a.critical || b.warning - a.warning),
    caveat: 'Readings are submitted samples, not authoritative live equipment state.',
  };
}

export function possibleSharedFault(items, threshold = 3) {
  const grouped = new Map();
  for (const reading of items || []) {
    if (evaluateLink(reading).status !== 'critical') continue;
    const segment = String(reading.segmentId || '').trim();
    if (!segment) continue;
    const group = grouped.get(segment) || new Set();
    group.add(String(reading.deviceId || reading.subscriberCode || 'unknown'));
    grouped.set(segment, group);
  }
  return [...grouped].filter(([, ids]) => ids.size >= threshold).map(([segment, ids]) => ({
    segmentId: segment,
    affectedDeviceCount: ids.size,
    classification: 'suspected_shared_fault',
    requiresHumanVerification: true,
  }));
}

export function customerExperienceRisk({outages30d = 0, openTickets = 0, daysSincePayment = 0} = {}) {
  const count = n => Math.max(0, Math.min(30, Number.isFinite(Number(n)) ? Number(n) : 0));
  const score = Math.min(100,
    Math.round(count(outages30d) * 15 + count(openTickets) * 20 + (count(daysSincePayment) > 30 ? 10 : 0)));
  return {
    score,
    band: score >= 60 ? 'high' : score >= 30 ? 'medium' : 'low',
    caveat: 'Service-recovery priority heuristic, not trained churn prediction; never use for adverse pricing.',
  };
}
