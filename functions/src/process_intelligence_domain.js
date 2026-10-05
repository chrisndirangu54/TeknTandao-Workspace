const clamp = (n, min, max) => Math.min(max, Math.max(min, Number(n) || 0));

export function normalizeTrace(events = []) {
  return events
    .map((event, index) => ({
      caseId: String(event.caseId || 'default'),
      activity: String(event.activity || '').trim(),
      timestamp: new Date(event.timestamp || index).getTime(),
      actor: event.actor ? String(event.actor) : null
    }))
    .filter(e => e.activity && Number.isFinite(e.timestamp))
    .sort((a, b) => a.timestamp - b.timestamp);
}

export function directlyFollowsGraph(events = []) {
  const traces = new Map();
  for (const event of normalizeTrace(events)) {
    if (!traces.has(event.caseId)) traces.set(event.caseId, []);
    traces.get(event.caseId).push(event);
  }
  const edges = new Map();
  const activityCounts = new Map();
  for (const trace of traces.values()) {
    for (const event of trace) activityCounts.set(event.activity, (activityCounts.get(event.activity) || 0) + 1);
    for (let i = 0; i < trace.length - 1; i++) {
      const key = `${trace[i].activity}→${trace[i + 1].activity}`;
      edges.set(key, (edges.get(key) || 0) + 1);
    }
  }
  return {
    cases: traces.size,
    activities: [...activityCounts.entries()].map(([activity, count]) => ({activity, count})),
    edges: [...edges.entries()].map(([path, count]) => {
      const [from, to] = path.split('→');
      return {from, to, count};
    })
  };
}

export function conformanceScore(events = [], reference = []) {
  const trace = normalizeTrace(events).map(e => e.activity);
  const expected = reference.map(String);
  if (!expected.length) return {fitness: 1, missing: [], unexpected: trace};
  const expectedSet = new Set(expected);
  const traceSet = new Set(trace);
  const missing = expected.filter(a => !traceSet.has(a));
  const unexpected = trace.filter(a => !expectedSet.has(a));
  let orderedMatches = 0;
  let cursor = 0;
  for (const activity of trace) {
    const idx = expected.indexOf(activity, cursor);
    if (idx >= cursor) {
      orderedMatches++;
      cursor = idx + 1;
    }
  }
  const orderFitness = orderedMatches / expected.length;
  const coverageFitness = (expected.length - missing.length) / expected.length;
  const penalty = Math.min(0.5, unexpected.length / Math.max(1, expected.length) * 0.2);
  return {
    fitness: Number(clamp((orderFitness * 0.55) + (coverageFitness * 0.45) - penalty, 0, 1).toFixed(4)),
    missing,
    unexpected
  };
}

export function bottleneckAnalysis(events = []) {
  const traces = new Map();
  for (const event of normalizeTrace(events)) {
    if (!traces.has(event.caseId)) traces.set(event.caseId, []);
    traces.get(event.caseId).push(event);
  }
  const waits = new Map();
  for (const trace of traces.values()) {
    for (let i = 0; i < trace.length - 1; i++) {
      const key = `${trace[i].activity}→${trace[i + 1].activity}`;
      const waitMs = Math.max(0, trace[i + 1].timestamp - trace[i].timestamp);
      if (!waits.has(key)) waits.set(key, []);
      waits.get(key).push(waitMs);
    }
  }
  return [...waits.entries()].map(([path, values]) => {
    const sorted = [...values].sort((a, b) => a - b);
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const p95 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))];
    const [from, to] = path.split('→');
    return {from, to, samples: values.length, meanWaitMs: Math.round(mean), p95WaitMs: Math.round(p95)};
  }).sort((a, b) => b.meanWaitMs - a.meanWaitMs);
}
