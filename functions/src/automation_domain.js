import {createCipheriv, createDecipheriv, randomBytes} from 'node:crypto';
import {z} from 'zod';
import {getQuickJS} from 'quickjs-emscripten';

export const automationId = z.string().regex(/^[A-Za-z0-9_-]{1,100}$/);
const jsonObject = z.record(z.unknown());
const toolStep = z.object({
  kind: z.literal('tool'), connectionId: automationId,
  tool: z.string().min(1).max(128), arguments: jsonObject.default({}),
}).strict();
const codeStep = z.object({kind: z.literal('code'), code: z.string().min(1).max(16000)}).strict();
export const workflowSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().max(2000).default(''),
  trigger: z.string().regex(/^(manual|[a-zA-Z0-9_.-]{1,100})$/).default('manual'),
  enabled: z.boolean().default(false),
  steps: z.array(z.discriminatedUnion('kind', [toolStep, codeStep])).min(1).max(10),
}).strict();
export const featureSchema = z.object({
  name: z.string().trim().min(1).max(120), description: z.string().max(2000),
  fields: z.array(z.object({
    key: z.string().regex(/^[a-z][a-zA-Z0-9_]{0,39}$/).refine(key => !['constructor', 'prototype', '__proto__'].includes(key)),
    label: z.string().min(1).max(100),
    type: z.enum(['text', 'number', 'email', 'date', 'boolean']),
    required: z.boolean(),
  }).strict()).min(1).max(20),
  code: z.string().max(16000).default('return input;'),
  workflowId: automationId.nullable().default(null),
}).strict().superRefine((feature, context) => {
  if (new Set(feature.fields.map(field => field.key)).size !== feature.fields.length) {
    context.addIssue({code: 'custom', message: 'Field keys must be unique'});
  }
});

export function boundedJson(value, maxBytes = 64000) {
  const encoded = JSON.stringify(value);
  if (!encoded || Buffer.byteLength(encoded) > maxBytes) throw new Error('JSON payload is too large');
  return JSON.parse(encoded);
}

export function hasPaidSubscription(installations, now = Date.now()) {
  return installations.some(app => app.state === 'paid' && (app.expiresAt?.toMillis?.() ?? 0) > now);
}

export function featureInput(feature, raw) {
  const input = jsonObject.parse(boundedJson(raw));
  const fields = {};
  for (const field of feature.fields) {
    let type = {text: z.string().max(4000), email: z.string().email(), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), number: z.number().finite(), boolean: z.boolean()}[field.type];
    if (field.required && field.type === 'text') type = type.min(1);
    fields[field.key] = field.required ? type : type.optional();
  }
  return z.object(fields).strict().parse(input);
}

// Only whole-value references are substituted; no evaluation or prototype access.
export function resolveArguments(value, context, depth = 0) {
  if (depth > 20) throw new Error('Arguments are too deeply nested');
  if (typeof value === 'string') {
    const match = /^\{\{((?:input|steps)(?:\.[A-Za-z0-9_]+)*)\}\}$/.exec(value);
    if (!match) return value;
    let current = context;
    for (const key of match[1].split('.')) {
      if (['__proto__', 'constructor', 'prototype'].includes(key) || current == null || !Object.hasOwn(current, key)) throw new Error(`Missing input reference: ${match[1]}`);
      current = current[key];
    }
    return boundedJson(current);
  }
  if (Array.isArray(value)) return value.map(item => resolveArguments(item, context, depth + 1));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => {
    if (['__proto__', 'constructor', 'prototype'].includes(key)) throw new Error('Invalid argument key');
    return [key, resolveArguments(item, context, depth + 1)];
  }));
  return value;
}

export async function runCustomCode(code, input, steps = []) {
  if (typeof code !== 'string' || code.length > 16000) throw new Error('Invalid custom code');
  const quickjs = await getQuickJS();
  const runtime = quickjs.newRuntime();
  runtime.setMemoryLimit(16 * 1024 * 1024);
  runtime.setMaxStackSize(256 * 1024);
  const deadline = Date.now() + 250;
  runtime.setInterruptHandler(() => Date.now() > deadline);
  const vm = runtime.newContext();
  try {
    const result = vm.evalCode(`(() => { const result = (function(input, steps) { "use strict";\n${code}\n})(${JSON.stringify(boundedJson(input))}, ${JSON.stringify(boundedJson(steps))}); if (result && typeof result.then === 'function') throw new Error('Async code is not supported'); return JSON.stringify(result); })()`);
    if (result.error) {
      const error = vm.dump(result.error);
      result.error.dispose();
      throw new Error(`Custom code failed: ${String(error?.message || 'execution limit reached').slice(0, 200)}`);
    }
    const encoded = vm.dump(result.value);
    result.value.dispose();
    if (typeof encoded !== 'string') throw new Error('Custom code must return JSON');
    return boundedJson(JSON.parse(encoded));
  } finally {
    vm.dispose();
    runtime.dispose();
  }
}

function encryptionKey(raw) {
  const key = Buffer.from(raw || '', 'base64');
  if (key.length !== 32) throw new Error('Configure AUTOMATION_ENCRYPTION_KEY as a base64 32-byte key');
  return key;
}
export function encryptCredential(value, key, context) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(key), iv);
  cipher.setAAD(Buffer.from(context));
  const data = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  return {iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), data: data.toString('base64')};
}
export function decryptCredential(value, key, context) {
  const cipher = createDecipheriv('aes-256-gcm', encryptionKey(key), Buffer.from(value.iv, 'base64'));
  cipher.setAAD(Buffer.from(context));
  cipher.setAuthTag(Buffer.from(value.tag, 'base64'));
  return JSON.parse(Buffer.concat([cipher.update(Buffer.from(value.data, 'base64')), cipher.final()]).toString('utf8'));
}
