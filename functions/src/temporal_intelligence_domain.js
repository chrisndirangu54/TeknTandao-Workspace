const DAY_MS = 86_400_000;
const clamp = (n, min, max) => Math.min(max, Math.max(min, Number(n) || 0));

export function normalizeMemoryEvent(input = {}) {
  const timestamp = new Date(input.timestamp || Date.now());
  if (Number.isNaN(timestamp.getTime())) throw new Error('invalid memory timestamp');
  const text = String(input.text || input.summary || '').trim();
  if (!text) throw new Error('memory text is required');
  return {
    id: String(input.id || '').trim() || null,
    type: String(input.type || 'business_event'),
    entityIds: Array.isArray(input.entityIds) ? [...new Set(input.entityIds.map(String))].slice(0, 50) : [],
    tags: Array.isArray(input.tags) ? [...new Set(input.tags.map(v => String(v).toLowerCase()))].slice(0, 30) : [],
    text: text.slice(0, 2000),
    timestamp: timestamp.toISOString(),
    importance: clamp(input.importance ?? 0.5, 0, 1),
    confidence: clamp(input.confidence ?? 1, 0, 1),
    source: String(input.source || 'platform')
  };
}

export function temporalRelevance(memoryInput, query = {}, now = new Date()) {
  const memory = normalizeMemoryEvent(memoryInput);
  const ageDays = Math.max(0, (now.getTime() - new Date(memory.timestamp).getTime()) / DAY_MS);
  const halfLifeDays = clamp(query.halfLifeDays ?? 30, 1, 3650);
  const recency = Math.pow(0.5, ageDays / halfLifeDays);
  const queryEntities = new Set((query.entityIds || []).map(String));
  const queryTags = new Set((query.tags || []).map(v => String(v).toLowerCase()));
  const entityOverlap = queryEntities.size
    ? memory.entityIds.filter(id => queryEntities.has(id)).length / queryEntities.size
    : 0;
  const tagOverlap = queryTags.size
    ? memory.tags.filter(tag => queryTags.has(tag)).length / queryTags.size
    : 0;
  const score =
    (0.35 * recency) +
    (0.25 * memory.importance) +
    (0.15 * memory.confidence) +
    (0.15 * entityOverlap) +
    (0.10 * tagOverlap);
  return Number(score.toFixed(6));
}

export function rankMemories(memories = [], query = {}, now = new Date(), limit = 20) {
  return memories
    .map(memory => ({memory: normalizeMemoryEvent(memory), score: temporalRelevance(memory, query, now)}))
    .sort((a, b) => b.score - a.score)
    .slice(0, clamp(limit, 1, 100));
}

export function detectTemporalTrend(points = []) {
  const clean = points
    .map(p => ({t: new Date(p.timestamp).getTime(), value: Number(p.value)}))
    .filter(p => Number.isFinite(p.t) && Number.isFinite(p.value))
    .sort((a, b) => a.t - b.t);
  if (clean.length < 2) return {slopePerDay: 0, direction: 'flat', samples: clean.length};
  const t0 = clean[0].t;
  const xs = clean.map(p => (p.t - t0) / DAY_MS);
  const ys = clean.map(p => p.value);
  const xMean = xs.reduce((a, b) => a + b, 0) / xs.length;
  const yMean = ys.reduce((a, b) => a + b, 0) / ys.length;
  const numerator = xs.reduce((sum, x, i) => sum + ((x - xMean) * (ys[i] - yMean)), 0);
  const denominator = xs.reduce((sum, x) => sum + ((x - xMean) ** 2), 0);
  const slope = denominator === 0 ? 0 : numerator / denominator;
  return {
    slopePerDay: Number(slope.toFixed(6)),
    direction: slope > 1e-9 ? 'up' : slope < -1e-9 ? 'down' : 'flat',
    samples: clean.length
  };
}
