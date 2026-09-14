import {createHash, createHmac, timingSafeEqual} from 'node:crypto';
import {identifier, textValue} from './domain.js';
import {applyWebsitePatch, validateWebsiteDocument, validateWebsitePatch, validateWebsiteNode} from './website_builder_domain.js';

const domainPattern = /^(?=.{3,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i;
const cmsFieldTypes = new Set(['text','longText','number','boolean','date','datetime','url','image','reference','json']);
const pluginCapabilities = new Set([
  'cms.read','cms.write','forms.receive','site.fragment','site.data','automation.emit','analytics.write','asset.read'
]);
const payoutRecipientTypes = new Set(['mobile_money','kepss','mobile_money_business']);
const experimentStatuses = new Set(['draft','active','paused','completed']);

function finite(value, label, min, max) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) throw new Error(`Invalid ${label}`);
  return value;
}

function clean(value, max = 1000) {
  if (value == null) return '';
  if (typeof value !== 'string' || value.length > max) throw new Error('Invalid text value');
  return value.trim();
}

function httpsUrl(value, label = 'URL') {
  const raw = clean(value, 2000);
  let parsed;
  try { parsed = new URL(raw); } catch { throw new Error(`Invalid ${label}`); }
  if (parsed.protocol !== 'https:') throw new Error(`${label} must use HTTPS`);
  parsed.hash = '';
  return parsed.toString();
}

export function normalizeWebsiteDomain(value) {
  const raw = clean(value, 253).toLowerCase().replace(/^https?:\/\//, '').replace(/\/$/, '').replace(/\.$/, '');
  let host;
  try { host = new URL(`https://${raw}`).hostname.toLowerCase(); } catch { throw new Error('Invalid domain'); }
  if (!domainPattern.test(host) || host === 'localhost') throw new Error('Invalid public domain');
  return host;
}

export function cloudflareDnsRecord(record) {
  if (!record || typeof record !== 'object') throw new Error('Invalid DNS record');
  const type = String(record.type || '').toUpperCase();
  if (!['A','AAAA','CNAME','TXT','CAA'].includes(type)) throw new Error(`Unsupported DNS record type ${type}`);
  const name = normalizeWebsiteDomain(String(record.domainName || '').replace(/\.$/, ''));
  let content = clean(record.rdata, 1000).replace(/\.$/, '');
  if (type === 'TXT' && content.startsWith('"') && content.endsWith('"')) content = content.slice(1, -1).replace(/\\"/g, '"');
  return {type, name, content, ttl: 1, proxied: false, requiredAction: String(record.requiredAction || 'ADD')};
}

export function validateAssetUploadRequest(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Invalid asset request');
  const name = clean(input.name, 180);
  if (!name) throw new Error('Asset name is required');
  const contentType = clean(input.contentType, 120).toLowerCase();
  const allowed = [
    'image/jpeg','image/png','image/webp','image/gif','image/avif',
    'video/mp4','video/webm','application/pdf','font/woff2'
  ];
  if (!allowed.includes(contentType)) throw new Error('Unsupported asset type');
  const size = Number(input.size);
  const max = contentType.startsWith('video/') ? 250 * 1024 * 1024 : 40 * 1024 * 1024;
  if (!Number.isSafeInteger(size) || size <= 0 || size > max) throw new Error('Invalid asset size');
  const projectId = identifier(input.projectId);
  return {name, contentType, size, projectId};
}

export function validateCmsCollection(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Invalid CMS collection');
  const collectionId = identifier(input.collectionId);
  const name = textValue(input.name, 120);
  if (!Array.isArray(input.fields) || !input.fields.length || input.fields.length > 60) throw new Error('CMS collection requires 1-60 fields');
  const seen = new Set();
  const fields = input.fields.map(field => {
    if (!field || typeof field !== 'object' || Array.isArray(field)) throw new Error('Invalid CMS field');
    const id = identifier(field.id);
    if (seen.has(id)) throw new Error(`Duplicate CMS field ${id}`);
    seen.add(id);
    const type = String(field.type || 'text');
    if (!cmsFieldTypes.has(type)) throw new Error(`Unsupported CMS field type ${type}`);
    return {
      id,
      label: textValue(field.label || id, 100),
      type,
      required: field.required === true,
      public: field.public !== false,
      ...(field.referenceCollection ? {referenceCollection: identifier(field.referenceCollection)} : {})
    };
  });
  const slugField = input.slugField ? identifier(input.slugField) : null;
  if (slugField && !seen.has(slugField)) throw new Error('Slug field is not in the CMS schema');
  const defaultSort = input.defaultSort ? identifier(input.defaultSort) : null;
  if (defaultSort && !seen.has(defaultSort)) throw new Error('Default sort field is not in the CMS schema');
  return {
    collectionId,
    name,
    fields,
    slugField,
    defaultSort,
    publicRead: input.publicRead === true,
    maxPublicItems: Number.isInteger(input.maxPublicItems) ? Math.max(1, Math.min(input.maxPublicItems, 100)) : 50
  };
}

function cmsValue(field, value) {
  if (value == null || value === '') {
    if (field.required) throw new Error(`${field.label} is required`);
    return null;
  }
  switch (field.type) {
    case 'number': return finite(Number(value), field.label, -1e15, 1e15);
    case 'boolean':
      if (typeof value !== 'boolean') throw new Error(`${field.label} must be boolean`);
      return value;
    case 'date':
    case 'datetime': {
      const parsed = new Date(value);
      if (Number.isNaN(parsed.getTime())) throw new Error(`${field.label} must be a valid date`);
      return parsed.toISOString();
    }
    case 'url':
    case 'image': return httpsUrl(value, field.label);
    case 'reference': return identifier(value);
    case 'json': {
      if (typeof value !== 'object' || Array.isArray(value) || JSON.stringify(value).length > 20000) throw new Error(`${field.label} must be a small JSON object`);
      return JSON.parse(JSON.stringify(value));
    }
    case 'longText': return clean(value, 20000);
    default: return clean(value, 2000);
  }
}

export function validateCmsEntry(schemaInput, input) {
  const schema = validateCmsCollection(schemaInput);
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Invalid CMS entry');
  const fields = {};
  for (const field of schema.fields) fields[field.id] = cmsValue(field, input[field.id]);
  const extra = Object.keys(input).filter(key => !schema.fields.some(field => field.id === key));
  if (extra.length) throw new Error(`Unknown CMS fields: ${extra.join(', ')}`);
  return fields;
}

export function publicCmsEntry(schemaInput, input) {
  const schema = validateCmsCollection(schemaInput);
  const result = {};
  for (const field of schema.fields.filter(field => field.public)) if (input[field.id] !== undefined) result[field.id] = input[field.id];
  return result;
}

export function interpolateBindings(value, context) {
  if (typeof value !== 'string') return value;
  return value.replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (_, path) => {
    let current = context;
    for (const part of path.split('.')) {
      if (!current || typeof current !== 'object' || !(part in current)) return '';
      current = current[part];
    }
    return current == null ? '' : String(current);
  });
}

export function validatePluginManifest(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Invalid plugin manifest');
  const pluginId = identifier(input.pluginId);
  const capabilities = Array.isArray(input.capabilities) ? [...new Set(input.capabilities.map(String))] : [];
  if (!capabilities.length || capabilities.some(capability => !pluginCapabilities.has(capability))) throw new Error('Invalid plugin capabilities');
  const allowedEvents = Array.isArray(input.allowedEvents)
    ? [...new Set(input.allowedEvents.map(value => identifier(value)))].slice(0, 50)
    : [];
  return {
    pluginId,
    name: textValue(input.name, 120),
    publisher: textValue(input.publisher, 120),
    description: textValue(input.description || 'Third-party website plugin', 600),
    endpoint: httpsUrl(input.endpoint, 'Plugin endpoint'),
    capabilities,
    allowedEvents,
    publicRuntime: input.publicRuntime === true,
    timeoutMs: Number.isInteger(input.timeoutMs) ? Math.max(1000, Math.min(input.timeoutMs, 10000)) : 7000,
    version: clean(input.version || '1.0.0', 40)
  };
}

export function validatePluginResponse(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Invalid plugin response');
  const kind = String(input.kind || 'data');
  if (kind === 'fragment') return {kind, fragment: validateWebsiteNode(input.fragment)};
  if (kind !== 'data') throw new Error('Unsupported plugin response kind');
  if (!input.data || typeof input.data !== 'object' || Array.isArray(input.data) || JSON.stringify(input.data).length > 100000) throw new Error('Invalid plugin data');
  return {kind, data: JSON.parse(JSON.stringify(input.data))};
}

export function derivePluginInstallToken(secret, orgId, pluginId, installId) {
  if (!secret) throw new Error('Plugin signing secret is not configured');
  return createHmac('sha256', secret).update(`${orgId}:${pluginId}:${installId}`).digest('hex');
}

export function validatePayoutProfile(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Invalid payout profile');
  const type = String(input.type || 'mobile_money');
  if (!payoutRecipientTypes.has(type)) throw new Error('Unsupported payout recipient type');
  const currency = String(input.currency || 'KES').toUpperCase();
  if (currency !== 'KES') throw new Error('Creator marketplace payouts are currently denominated in KES');
  return {
    type,
    currency,
    name: textValue(input.name, 120),
    accountNumber: clean(input.accountNumber, 80),
    bankCode: clean(input.bankCode, 40),
    minPayoutMinor: Number.isSafeInteger(input.minPayoutMinor) ? Math.max(10000, Math.min(input.minPayoutMinor, 100000000)) : 100000,
    active: input.active !== false
  };
}

export function validateWebsiteExperiment(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Invalid experiment');
  const experimentId = identifier(input.experimentId);
  const status = String(input.status || 'draft');
  if (!experimentStatuses.has(status)) throw new Error('Invalid experiment status');
  if (!Array.isArray(input.variants) || input.variants.length < 2 || input.variants.length > 8) throw new Error('Experiments require 2-8 variants');
  const variants = input.variants.map(variant => {
    const id = identifier(variant.id);
    const version = Number(variant.version);
    const weight = Number(variant.weight);
    if (!Number.isInteger(version) || version < 1) throw new Error('Experiment variant requires a published version');
    if (!Number.isInteger(weight) || weight < 1 || weight > 10000) throw new Error('Invalid experiment weight');
    return {id, version, weight};
  });
  if (new Set(variants.map(v => v.id)).size !== variants.length) throw new Error('Duplicate experiment variant');
  const totalWeight = variants.reduce((sum, variant) => sum + variant.weight, 0);
  if (totalWeight !== 10000) throw new Error('Experiment weights must total 10000 basis points');
  const goals = Array.isArray(input.goals) ? [...new Set(input.goals.map(identifier))].slice(0, 20) : ['conversion'];
  const path = clean(input.path || '*', 160);
  if (path !== '*' && !path.startsWith('/')) throw new Error('Experiment path must be * or start with /');
  return {
    experimentId,
    name: textValue(input.name, 120),
    projectId: identifier(input.projectId),
    status,
    path,
    variants,
    goals,
    trafficBps: Number.isInteger(input.trafficBps) ? Math.max(1, Math.min(input.trafficBps, 10000)) : 10000,
    startsAt: input.startsAt ? new Date(input.startsAt).toISOString() : null,
    endsAt: input.endsAt ? new Date(input.endsAt).toISOString() : null
  };
}

function hashBucket(value, mod = 10000) {
  const digest = createHash('sha256').update(value).digest();
  return digest.readUInt32BE(0) % mod;
}

export function assignExperimentVariant(experimentInput, visitorHash) {
  const experiment = validateWebsiteExperiment(experimentInput);
  const visitor = clean(visitorHash, 256);
  if (!visitor) throw new Error('Visitor id is required');
  const trafficBucket = hashBucket(`${experiment.experimentId}:traffic:${visitor}`);
  if (trafficBucket >= experiment.trafficBps) return null;
  const bucket = hashBucket(`${experiment.experimentId}:variant:${visitor}`);
  let cursor = 0;
  for (const variant of experiment.variants) {
    cursor += variant.weight;
    if (bucket < cursor) return variant;
  }
  return experiment.variants.at(-1);
}

export function signAnalyticsToken(secret, payload) {
  if (!secret) throw new Error('Analytics signing key is not configured');
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = createHmac('sha256', secret).update(encoded).digest('base64url');
  return `${encoded}.${signature}`;
}

export function verifyAnalyticsToken(secret, token) {
  if (!secret || typeof token !== 'string') throw new Error('Invalid analytics token');
  const [encoded, signature] = token.split('.');
  if (!encoded || !signature) throw new Error('Invalid analytics token');
  const expected = createHmac('sha256', secret).update(encoded).digest();
  let supplied;
  try { supplied = Buffer.from(signature, 'base64url'); } catch { throw new Error('Invalid analytics token'); }
  if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) throw new Error('Invalid analytics token');
  const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
  if (!payload.exp || Date.now() > payload.exp) throw new Error('Analytics token expired');
  return payload;
}

export function hashVisitor(secret, visitorId) {
  if (!secret) throw new Error('Analytics signing key is not configured');
  const visitor = clean(visitorId, 256);
  if (!visitor) throw new Error('Visitor id is required');
  return createHmac('sha256', secret).update(visitor).digest('hex');
}

export function validatePublicFormValues(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Invalid form values');
  const entries = Object.entries(input);
  if (!entries.length || entries.length > 30) throw new Error('Form requires 1-30 fields');
  const result = {};
  for (const [rawKey, rawValue] of entries) {
    const key = identifier(rawKey);
    if (typeof rawValue !== 'string' || rawValue.length > 10000) throw new Error(`Invalid form field ${key}`);
    result[key] = rawValue.trim();
  }
  return result;
}

export function scoreFormSpam(values, {honeypot = '', elapsedMs = 0} = {}) {
  let score = 0;
  const text = Object.values(values).join(' ').toLowerCase();
  if (honeypot) score += 100;
  if (elapsedMs > 0 && elapsedMs < 800) score += 35;
  const links = (text.match(/https?:\/\//g) || []).length;
  if (links > 2) score += Math.min(40, links * 8);
  if (/(.)\1{12,}/.test(text)) score += 20;
  if (/\b(?:viagra|casino|crypto giveaway|guaranteed profit)\b/i.test(text)) score += 25;
  if (text.length > 15000) score += 10;
  return Math.min(100, score);
}

export function validateCrdtOperation(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Invalid collaboration operation');
  const actorId = identifier(input.actorId);
  const opId = identifier(input.opId);
  const clock = Number(input.clock);
  const epoch = Number(input.epoch || 1);
  if (!Number.isSafeInteger(clock) || clock < 1) throw new Error('Invalid collaboration clock');
  if (!Number.isSafeInteger(epoch) || epoch < 1) throw new Error('Invalid collaboration epoch');
  return {actorId, opId, clock, epoch, patch: validateWebsitePatch(input.patch)};
}

export function crdtOperationKey(input) {
  const op = validateCrdtOperation(input);
  return `${String(op.clock).padStart(16, '0')}:${op.actorId}:${op.opId}`;
}

export function mergeWebsiteCrdtOps(...replicas) {
  const byId = new Map();
  for (const replica of replicas) {
    for (const raw of replica || []) {
      const op = validateCrdtOperation(raw);
      const key = `${op.epoch}:${op.actorId}:${op.opId}`;
      const prior = byId.get(key);
      if (!prior || crdtOperationKey(op) > crdtOperationKey(prior)) byId.set(key, op);
    }
  }
  return [...byId.values()].sort((a, b) => crdtOperationKey(a).localeCompare(crdtOperationKey(b)));
}

export function replayWebsiteCrdtOps(baseDocument, operations) {
  let document = validateWebsiteDocument(baseDocument);
  const pending = mergeWebsiteCrdtOps(operations);
  const applied = [];
  let remaining = pending;
  for (let pass = 0; pass < pending.length + 1 && remaining.length; pass += 1) {
    const next = [];
    let progressed = false;
    for (const op of remaining) {
      try {
        document = applyWebsitePatch(document, op.patch);
        applied.push(op.opId);
        progressed = true;
      } catch (error) {
        const message = String(error?.message || '');
        if (/not found|already exists|Target parent|page root/i.test(message)) next.push(op);
        else throw error;
      }
    }
    if (!progressed) { remaining = next; break; }
    remaining = next;
  }
  return {document: validateWebsiteDocument(document), appliedOpIds: applied, unresolvedOpIds: remaining.map(op => op.opId)};
}
