// Decision support only: bounded deterministic models, no autonomous actions.
const round = n => Math.round(n * 100) / 100;

export function capacityForecast(samples = []) {
  const values = (samples || [])
    .map(x => Number(x.utilizationPct))
    .filter(x => Number.isFinite(x) && x >= 0 && x <= 100);
  if (values.length < 5) return {
    state: 'insufficient_data', estimateUtilizationPct: null,
    recommendation: 'Collect at least five comparable samples before trend analysis.',
  };
  const lookback = values.slice(-30);
  const recent = lookback.slice(-Math.min(5, lookback.length));
  const baseline = lookback.reduce((a, b) => a + b, 0) / lookback.length;
  const current = recent.reduce((a, b) => a + b, 0) / recent.length;
  const estimate = Math.min(100, Math.max(0, current + (current - baseline)));
  const status = estimate >= 85 ? 'capacity_review' : 'within_sampled_capacity';
  return {state: status, estimateUtilizationPct: round(estimate),
    baselineUtilizationPct: round(baseline), recentUtilizationPct: round(current),
    recommendation: status === 'capacity_review' ? 'Verify busy-hour capacity and link saturation before upgrading.'
      : 'Keep monitoring representative busy-hour samples.',
    caveat: 'Heuristic projection only; requires timestamps, upstream link capacity and multi-week history for forecasting.'};
}
export function explainSupportMessage(message = '') {
  const text = String(message).toLowerCase().slice(0, 1000);
  const dictionary = [
    ['payment', /(?:mpesa|m-pesa|paybill|stk|paid|payment|invoice|bill|renewal)/],
    ['connectivity', /(?:offline|no internet|not connected|outage|disconnected|down|red light|los|link)/],
    ['performance', /(?:slow|lag|latency|buffer|speed|jitter|ping|packet loss)/],
    ['installation', /(?:install|new house|relocate|move house|router setup|fibre cable)/],
  ];
  const category = dictionary.find(([, regex]) => regex.test(text))?.[0] || 'general';
  return {category, needsAgentReview: true,
    nextStep: {
      payment: 'Check account ledger and verified payment reference.',
      connectivity: 'Check incident list, device status and physical link.',
      performance: 'Check verified latency, loss, Wi-Fi RF and congestion metrics.',
      installation: 'Check site survey, equipment stock and technician scheduling.',
      general: 'Assign to a human agent for clarification.',
    }[category],
    caveat: 'Keyword triage, not an LLM-generated response or live diagnostic.'};
}

export const minimumCpeCriteria = Object.freeze({
  telemetry: ['TR-069/USP device stats OR approved SNMP/API support'],
  segmentation: ['Client isolation and VLAN compatibility where required'],
  lifecycle: ['Documented firmware upgrade and recovery'],
  provisioning: ['WAN PPPoE, VLAN and ISP controller compatibility'],
  validation: ['Hardware revision, OLT/ONT profile, local type approval, supplier warranty'],
});
