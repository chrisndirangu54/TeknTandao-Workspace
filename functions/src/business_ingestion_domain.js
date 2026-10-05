import {createHash, timingSafeEqual} from 'node:crypto';
import {z} from 'zod';

export const intakeTargets = Object.freeze({
  asset: {appId: 'assets', risk: 'standard'},
  inventory: {appId: 'inventory', risk: 'standard'},
  expense: {appId: 'expenses', risk: 'financial-draft'},
  sale: {appId: 'pos', risk: 'transaction-draft'},
  support_ticket: {appId: 'helpdesk', risk: 'standard'},
  generic: {appId: null, risk: 'standard'},
});

export const supportedIntakeMimeTypes = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
  'text/plain',
  'text/csv',
  'application/json',
]);

export const intakeUploadSchema = z.object({
  name: z.string().trim().min(1).max(240),
  contentType: z.string().trim().min(1).max(120),
  size: z.number().int().positive().max(12 * 1024 * 1024),
}).strict().superRefine((value, ctx) => {
  if (!supportedIntakeMimeTypes.has(value.contentType)) {
    ctx.addIssue({code: z.ZodIssueCode.custom, message: 'Unsupported intake file type'});
  }
});

const primitive = z.union([
  z.string().max(4000),
  z.number().finite(),
  z.boolean(),
  z.null(),
]);

export const extractedRecordSchema = z.object({
  target: z.enum(['asset', 'inventory', 'expense', 'sale', 'support_ticket', 'generic']),
  appId: z.string().regex(/^[A-Za-z0-9_-]{1,100}$/).nullable().default(null),
  title: z.string().trim().min(1).max(240),
  fields: z.record(primitive).default({}),
  confidence: z.number().min(0).max(1),
  evidence: z.array(z.string().max(500)).max(20).default([]),
  warnings: z.array(z.string().max(500)).max(20).default([]),
}).strict();

export const extractionSchema = z.object({
  summary: z.string().max(2000).default(''),
  records: z.array(extractedRecordSchema).max(100),
  warnings: z.array(z.string().max(500)).max(50).default([]),
}).strict();

export function normalizeExtraction(input) {
  const parsed = extractionSchema.parse(input);
  return {
    ...parsed,
    records: parsed.records.map((record) => {
      const target = intakeTargets[record.target];
      const resolvedAppId = record.target === 'generic'
        ? record.appId
        : target.appId;
      if (record.target === 'generic' && !resolvedAppId) {
        throw new Error('Generic extracted records require appId');
      }
      const warnings = [...record.warnings];
      if (record.confidence < 0.7) warnings.push('Low-confidence extraction: verify before committing.');
      if (target.risk !== 'standard') warnings.push('Sensitive transaction: commit creates a draft for review, not a posted transaction.');
      return {
        ...record,
        appId: resolvedAppId,
        risk: target.risk,
        warnings: [...new Set(warnings)],
      };
    }),
  };
}

export function proposalDigest(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

export function hashIngestionKey(raw) {
  return createHash('sha256').update(String(raw)).digest('hex');
}

export function verifyIngestionKey(raw, expectedHex) {
  const actual = Buffer.from(hashIngestionKey(raw), 'hex');
  const expected = Buffer.from(String(expectedHex || ''), 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function safeTextInput(value) {
  const text = String(value || '').trim();
  if (!text || text.length > 30000) throw new Error('Intake text must be 1-30000 characters');
  return text;
}

export function commitShape(record) {
  const parsed = extractedRecordSchema.parse(record);
  const fields = parsed.fields;
  switch (parsed.target) {
    case 'inventory': {
      const name = String(fields.name || fields.item || parsed.title).trim().slice(0, 240);
      const stock = Number(fields.stock ?? fields.quantity ?? 0);
      const priceMinor = Number(fields.priceMinor ?? fields.price ?? 0);
      if (!name) throw new Error('Inventory item name is required');
      if (!Number.isSafeInteger(stock) || stock < 0 || stock > 10_000_000) throw new Error('Inventory stock must be a non-negative integer');
      if (!Number.isSafeInteger(priceMinor) || priceMinor < 0) throw new Error('Inventory price must be minor currency units');
      return {
        kind: 'inventory',
        data: {
          name,
          sku: String(fields.sku || '').slice(0, 120),
          stock,
          price: priceMinor,
          warehouse: String(fields.warehouse || fields.location || 'Main Warehouse').slice(0, 160),
          category: String(fields.category || 'General Product').slice(0, 160),
        },
      };
    }
    case 'support_ticket':
      return {
        kind: 'support_ticket',
        data: {
          name: parsed.title,
          subject: String(fields.subject || parsed.title).slice(0, 240),
          customer: String(fields.customer || '').slice(0, 240),
          priority: String(fields.priority || 'normal').slice(0, 40),
          channel: String(fields.channel || 'smart-intake').slice(0, 80),
          assignee: String(fields.assignee || '').slice(0, 160),
          resolution: String(fields.notes || fields.description || '').slice(0, 4000),
          status: 'OPEN',
        },
      };
    case 'asset':
      return {
        kind: 'asset',
        data: {
          name: parsed.title,
          asset: String(fields.asset || fields.name || parsed.title).slice(0, 240),
          category: String(fields.category || 'Asset').slice(0, 120),
          risk: String(fields.condition || fields.risk || 'unknown').slice(0, 80),
          owner: String(fields.owner || '').slice(0, 160),
          notes: String(fields.notes || fields.description || '').slice(0, 4000),
          status: 'ACTIVE',
        },
      };
    case 'expense':
      return {
        kind: 'expense_draft',
        data: {
          title: parsed.title,
          vendor: String(fields.vendor || fields.counterparty || '').slice(0, 240),
          amountMinor: Number(fields.amountMinor ?? fields.amount ?? 0),
          currency: String(fields.currency || 'KES').slice(0, 8),
          date: String(fields.date || '').slice(0, 40),
          reference: String(fields.reference || fields.receipt || '').slice(0, 240),
          category: String(fields.category || '').slice(0, 120),
          notes: String(fields.notes || '').slice(0, 4000),
          state: 'draft_review',
          status: 'DRAFT',
        },
      };
    case 'sale':
      return {
        kind: 'sale_draft',
        data: {
          title: parsed.title,
          productId: String(fields.productId || '').slice(0, 100),
          contactId: String(fields.contactId || '').slice(0, 100),
          item: String(fields.item || fields.product || '').slice(0, 240),
          customer: String(fields.customer || '').slice(0, 240),
          quantity: Number(fields.quantity || 0),
          totalMinor: Number(fields.totalMinor ?? fields.total ?? 0),
          currency: String(fields.currency || 'KES').slice(0, 8),
          state: 'draft_review',
        },
      };
    case 'generic':
      return {
        kind: 'generic',
        data: {
          name: parsed.title,
          ...Object.fromEntries(Object.entries(fields).slice(0, 50)),
        },
      };
    default:
      throw new Error('Unsupported intake target');
  }
}
