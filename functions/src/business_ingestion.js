import './index.js';
import {createHash, randomBytes, randomUUID} from 'node:crypto';
import {getApp} from 'firebase-admin/app';
import {FieldValue, Timestamp, getFirestore} from 'firebase-admin/firestore';
import {getStorage} from 'firebase-admin/storage';
import {defineSecret} from 'firebase-functions/params';
import {HttpsError, onCall, onRequest} from 'firebase-functions/v2/https';
import {catalog, canAccess, identifier} from './domain.js';
import {
  commitShape,
  hashIngestionKey,
  intakeUploadSchema,
  normalizeExtraction,
  proposalDigest,
  safeTextInput,
  verifyIngestionKey,
} from './business_ingestion_domain.js';

const db = getFirestore();
const region = 'europe-west1';
const geminiKey = defineSecret('GEMINI_API_KEY');
const stamp = () => FieldValue.serverTimestamp();
const orgRoot = (orgId) => db.doc(\`organizations/${identifier(orgId)}\`);
const uploadIdSchema = /^[A-Za-z0-9_-]{1,100}$/;

function uid(request) {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in first');
  return request.auth.uid;
}

async function authorize(request, {ownerOnly = false} = {}) {
  const user = uid(request);
  const org = orgRoot(request.data.orgId);
  const member = (await org.collection('members').doc(user).get()).data();
  if (!member || (ownerOnly && member.role !== 'owner')) {
    throw new HttpsError('permission-denied', 'Workspace access denied');
  }
  return {org, user, member};
}

function callable(handler, secrets = []) {
  return onCall({region, secrets, timeoutSeconds: 180, memory: '1GiB'}, async request => {
    try {
      return await handler(request);
    } catch (error) {
      if (error instanceof HttpsError) throw error;
      throw new HttpsError(
        'failed-precondition',
        String(error?.message || 'Smart Intake operation failed').slice(0, 1000),
      );
    }
  });
}

function intakeBucket() {
  const name = process.env.BUSINESS_INTAKE_BUCKET || getApp().options.storageBucket;
  if (!name) throw new Error('Configure BUSINESS_INTAKE_BUCKET or Firebase storageBucket');
  return getStorage().bucket(name);
}

function extensionFor(contentType) {
  return ({
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'application/pdf': 'pdf',
    'text/plain': 'txt',
    'text/csv': 'csv',
    'application/json': 'json',
  })[contentType] || 'bin';
}

function parseModelJson(text) {
  const clean = String(text || '')
    .replace(/^\s*\x60\x60\x60(?:json)?/i, '')
    .replace(/\x60\x60\x60\s*$/i, '')
    .trim();
  if (!clean) throw new Error('AI extractor returned no content');
  return JSON.parse(clean);
}

function extractionPrompt(extra = '') {
  return \`You are TeknTandao Smart Intake, a conservative business-record extraction engine.
Extract only information explicitly present in the provided input. Never invent IDs, prices, quantities, dates, vendors, customers, tax information, payment status, or ledger postings.

Return JSON with this exact shape:
{
  "summary": "short source summary",
  "warnings": ["source-level warning"],
  "records": [
    {
      "target": "asset|inventory|expense|sale|support_ticket|generic",
      "appId": null,
      "title": "human-readable record title",
      "fields": {"key": "primitive value only"},
      "confidence": 0.0,
      "evidence": ["short evidence fragments or visual cues"],
      "warnings": ["record-specific uncertainty"]
    }
  ]
}

Field guidance:
- asset: asset/name, category, owner, condition/risk, notes, serialNumber, location
- inventory: name/item, sku, stock/quantity as INTEGER, priceMinor as INTEGER minor currency units only when clearly stated, warehouse/location, category
- expense: vendor/counterparty, amountMinor as INTEGER minor currency units, currency, date, reference/receipt, category, notes
- sale: item/product, productId only if explicitly given, customer, contactId only if explicitly given, quantity, totalMinor as INTEGER minor currency units, currency
- support_ticket: subject, customer, priority, channel, assignee, notes/description
- generic: set appId to the explicit TeknTandao app id only when supplied in the input; otherwise prefer a named target above.

Rules:
1. If a monetary amount is shown in major units, convert to minor units and mention the conversion in evidence.
2. If handwritten, blurred, or ambiguous, lower confidence and add a warning.
3. Do not post accounting entries or mark a payment as verified.
4. A receipt can produce an expense draft; an invoice or sale note can produce a sale draft.
5. IoT readings should become generic records unless they clearly represent stock/assets.
6. Return no more than 100 records.
${extra}\`;
}

async function geminiExtract({text, bytes, contentType, context = ''}) {
  const key = geminiKey.value();
  const model = process.env.GEMINI_MODEL;
  if (!key || !model) throw new Error('Configure GEMINI_API_KEY and GEMINI_MODEL before Smart Intake AI extraction');

  const parts = [{text: extractionPrompt(context)}];
  if (text) parts.push({text: safeTextInput(text)});
  if (bytes) {
    parts.push({
      inlineData: {
        mimeType: contentType,
        data: bytes.toString('base64'),
      },
    });
  }

  const response = await fetch(
    \`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent\`,
    {
      method: 'POST',
      headers: {'Content-Type': 'application/json', 'x-goog-api-key': key},
      signal: AbortSignal.timeout(90000),
      body: JSON.stringify({
        contents: [{role: 'user', parts}],
        generationConfig: {temperature: 0.1, responseMimeType: 'application/json'},
      }),
    },
  );
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.error?.message || \`AI extraction failed (${response.status})\`);
  }
  const output = payload.candidates?.[0]?.content?.parts
    ?.map((part) => part.text || '')
    .join('')
    .trim();
  return normalizeExtraction(parseModelJson(output));
}

async function ensureAccessibleApps(org, member, records) {
  const unique = [...new Set(records.map((record) => record.appId).filter(Boolean))];
  const installations = await Promise.all(
    unique.map((appId) => org.collection('apps').doc(appId).get()),
  );
  for (let i = 0; i < unique.length; i += 1) {
    const appId = unique[i];
    if (!Object.hasOwn(catalog, appId)) throw new Error(\`Unknown target app: ${appId}\`);
    if (!canAccess(member, appId, installations[i].data())) {
      throw new HttpsError(
        'permission-denied',
        \`Install/subscribe to ${appId} and grant access before importing into it\`,
      );
    }
  }
}

async function saveProposal(org, actorUid, source, extraction, sourceMeta = {}) {
  const normalized = normalizeExtraction(extraction);
  const digest = proposalDigest({source, sourceMeta, normalized});
  const existing = await org
    .collection('businessIntakeProposals')
    .where('digest', '==', digest)
    .limit(1)
    .get();
  if (!existing.empty) {
    const doc = existing.docs[0];
    return {id: doc.id, ...doc.data(), duplicate: true};
  }
  const id = identifier(\`intake_${randomUUID()}\`);
  const record = {
    source,
    sourceMeta,
    digest,
    summary: normalized.summary,
    warnings: normalized.warnings,
    records: normalized.records,
    state: 'review',
    committedIndexes: [],
    createdBy: actorUid,
    createdAt: stamp(),
    updatedAt: stamp(),
  };
  await org.collection('businessIntakeProposals').doc(id).set(record);
  return {id, ...record, duplicate: false};
}

export const createBusinessIntakeUpload = callable(async request => {
  const {org, user} = await authorize(request);
  const input = intakeUploadSchema.parse({
    name: request.data.name,
    contentType: request.data.contentType,
    size: Number(request.data.size),
  });
  const uploadId = identifier(\`intake_upload_${randomUUID()}\`);
  const ext = extensionFor(input.contentType);
  const path = \`business-intake/${org.id}/${uploadId}.${ext}\`;
  const file = intakeBucket().file(path);
  const expiresAt = Date.now() + 15 * 60 * 1000;
  const [uploadUrl] = await file.getSignedUrl({
    version: 'v4',
    action: 'write',
    expires: expiresAt,
    contentType: input.contentType,
  });
  await org.collection('businessIntakeUploads').doc(uploadId).set({
    ...input,
    uploadId,
    storagePath: path,
    state: 'awaiting_upload',
    createdBy: user,
    createdAt: stamp(),
    expiresAt: Timestamp.fromMillis(expiresAt),
  });
  return {uploadId, uploadUrl, method: 'PUT', headers: {'Content-Type': input.contentType}, expiresAt};
});

export const analyzeBusinessIntakeUpload = callable(async request => {
  const {org, user, member} = await authorize(request);
  const uploadId = String(request.data.uploadId || '');
  if (!uploadIdSchema.test(uploadId)) throw new Error('Invalid upload id');
  const ref = org.collection('businessIntakeUploads').doc(uploadId);
  const snapshot = await ref.get();
  if (!snapshot.exists) throw new Error('Smart Intake upload not found');
  const upload = snapshot.data();
  if (upload.createdBy !== user && member.role !== 'owner') throw new Error('Upload belongs to another user');

  const file = intakeBucket().file(upload.storagePath);
  const [metadata] = await file.getMetadata();
  const actualSize = Number(metadata.size);
  if (
    !Number.isSafeInteger(actualSize) ||
    actualSize <= 0 ||
    actualSize > upload.size ||
    actualSize > 12 * 1024 * 1024 ||
    metadata.contentType !== upload.contentType
  ) {
    throw new Error('Uploaded file does not match the signed request');
  }
  const [bytes] = await file.download();
  const extraction = await geminiExtract({
    bytes,
    contentType: upload.contentType,
    context: \`File name: ${upload.name}\`,
  });
  await ensureAccessibleApps(org, member, extraction.records);
  const proposal = await saveProposal(
    org,
    user,
    'file',
    extraction,
    {
      uploadId,
      name: upload.name,
      contentType: upload.contentType,
      size: actualSize,
      md5Hash: metadata.md5Hash || null,
      storagePath: upload.storagePath,
      retainedUntil: Date.now() + 30 * 86400000,
    },
  );
  await ref.set({state: 'analyzed', proposalId: proposal.id, analyzedAt: stamp()}, {merge: true});
  return proposal;
}, [geminiKey]);

export const analyzeBusinessIntakeText = callable(async request => {
  const {org, user, member} = await authorize(request);
  const text = safeTextInput(request.data.text);
  const extraction = await geminiExtract({
    text,
    context: 'The source is natural-language business input supplied by an authenticated workspace user.',
  });
  await ensureAccessibleApps(org, member, extraction.records);
  return saveProposal(
    org,
    user,
    'natural_language',
    extraction,
    {textHash: createHash('sha256').update(text).digest('hex')},
  );
}, [geminiKey]);

export const getBusinessIntakeProposals = callable(async request => {
  const {org} = await authorize(request);
  const snapshots = await org
    .collection('businessIntakeProposals')
    .orderBy('createdAt', 'desc')
    .limit(50)
    .get();
  return {
    proposals: snapshots.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        ...data,
        createdAt: data.createdAt?.toMillis?.() ?? null,
        updatedAt: data.updatedAt?.toMillis?.() ?? null,
      };
    }),
  };
});

function numberOrZero(value) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}

function targetRef(org, proposalId, index, shape, record) {
  const deterministicId = identifier(\`intake_${proposalId}_${index}\`);
  if (shape.kind === 'inventory') return org.collection('products').doc(deterministicId);
  if (shape.kind === 'support_ticket') return org.collection('tickets').doc(deterministicId);
  if (shape.kind === 'asset') return org.collection('assets').doc(deterministicId);
  if (shape.kind === 'expense_draft') return org.collection('expenseDrafts').doc(deterministicId);
  if (shape.kind === 'sale_draft') return org.collection('saleDrafts').doc(deterministicId);
  return org.collection('modules').doc(record.appId).collection('records').doc(deterministicId);
}

function selectedIndexes(value) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 100) {
    throw new Error('Select between 1 and 100 proposal records');
  }
  const indexes = [...new Set(value.map(Number))];
  if (indexes.some((n) => !Number.isSafeInteger(n) || n < 0 || n > 99)) {
    throw new Error('Invalid proposal record index');
  }
  return indexes;
}

export const commitBusinessIntakeProposal = callable(async request => {
  const {org, user, member} = await authorize(request);
  const proposalId = identifier(request.data.proposalId);
  const selected = selectedIndexes(request.data.indexes);
  const proposalRef = org.collection('businessIntakeProposals').doc(proposalId);

  const proposal = (await proposalRef.get()).data();
  if (!proposal) throw new Error('Smart Intake proposal not found');
  const records = Array.isArray(proposal.records) ? proposal.records : [];
  const chosen = selected.map((index) => {
    if (!records[index]) throw new Error(\`Proposal record ${index} does not exist\`);
    return {index, record: records[index]};
  });
  await ensureAccessibleApps(org, member, chosen.map((entry) => entry.record));

  await db.runTransaction(async (tx) => {
    const fresh = (await tx.get(proposalRef)).data();
    const committed = new Set(fresh?.committedIndexes || []);
    for (const {index, record} of chosen) {
      if (committed.has(index)) continue;
      const shape = commitShape(record);
      if (shape.kind === 'expense_draft') {
        shape.data.amountMinor = numberOrZero(shape.data.amountMinor);
        if (!Number.isSafeInteger(shape.data.amountMinor) || shape.data.amountMinor < 0) {
          throw new Error('Expense amount must be a non-negative integer in minor currency units');
        }
      }
      if (shape.kind === 'sale_draft') {
        shape.data.quantity = numberOrZero(shape.data.quantity);
        shape.data.totalMinor = numberOrZero(shape.data.totalMinor);
        if (shape.data.quantity < 0 || shape.data.totalMinor < 0) {
          throw new Error('Sale draft values cannot be negative');
        }
      }
      const ref = targetRef(org, proposalId, index, shape, record);
      tx.set(ref, {
        ...shape.data,
        intakeProposalId: proposalId,
        intakeRecordIndex: index,
        intakeSource: proposal.source,
        intakeConfidence: record.confidence,
        intakeEvidence: record.evidence || [],
        createdBy: user,
        createdAt: stamp(),
        updatedAt: stamp(),
      }, {merge: false});
      committed.add(index);
    }
    tx.update(proposalRef, {
      committedIndexes: [...committed].sort((a, b) => a - b),
      state: committed.size === records.length ? 'committed' : 'partially_committed',
      updatedAt: stamp(),
      lastCommittedBy: user,
    });
  });

  return {ok: true, proposalId, committedIndexes: selected};
});

function ingestionWebhookUrl() {
  const projectId = getApp().options.projectId || process.env.GCLOUD_PROJECT;
  return projectId
    ? `https://${region}-${projectId}.cloudfunctions.net/businessIngestionWebhook`
    : null;
}

export const createBusinessIngestionKey = callable(async request => {
  const {org, user} = await authorize(request, {ownerOnly: true});
  const name = String(request.data.name || 'IoT / API ingestion').trim().slice(0, 120);
  const keyId = identifier(\`ing_${randomUUID()}\`);
  const secret = randomBytes(32).toString('base64url');
  const token = \`ti_${keyId}.${secret}\`;
  const keyHash = hashIngestionKey(token);
  await Promise.all([
    db.doc(\`businessIngestionKeys/${keyId}\`).set({
      keyHash,
      orgId: org.id,
      name,
      active: true,
      createdBy: user,
      createdAt: stamp(),
    }),
    org.collection('businessIngestionKeys').doc(keyId).set({
      keyId,
      name,
      active: true,
      createdBy: user,
      createdAt: stamp(),
    }),
  ]);
  return {keyId, name, token, webhookUrl: ingestionWebhookUrl()};
});

export const listBusinessIngestionKeys = callable(async request => {
  const {org} = await authorize(request, {ownerOnly: true});
  const snapshots = await org.collection('businessIngestionKeys').orderBy('createdAt', 'desc').limit(50).get();
  return {
    webhookUrl: ingestionWebhookUrl(),
    keys: snapshots.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
      createdAt: doc.data().createdAt?.toMillis?.() ?? null,
    })),
  };
});

export const revokeBusinessIngestionKey = callable(async request => {
  const {org} = await authorize(request, {ownerOnly: true});
  const keyId = identifier(request.data.keyId);
  await Promise.all([
    db.doc(\`businessIngestionKeys/${keyId}\`).set({active: false, revokedAt: stamp()}, {merge: true}),
    org.collection('businessIngestionKeys').doc(keyId).set({active: false, revokedAt: stamp()}, {merge: true}),
  ]);
  return {ok: true};
});

async function consumeIngestionQuota(keyId) {
  const day = new Date().toISOString().slice(0, 10);
  const ref = db.doc(`businessIngestionUsage/${keyId}_${day}`);
  await db.runTransaction(async (tx) => {
    const count = Number((await tx.get(ref)).data()?.count || 0);
    if (count >= 5000) throw new Error('Daily ingestion-key request limit reached');
    tx.set(ref, {
      count: count + 1,
      keyId,
      day,
      expiresAt: Timestamp.fromMillis(Date.now() + 14 * 86400000),
      updatedAt: stamp(),
    }, {merge: true});
  });
}

async function authenticateIngestionRequest(request) {
  const auth = String(request.get('authorization') || '');
  const match = /^Bearer (ti_(ing_[A-Za-z0-9_-]+)\.[A-Za-z0-9_-]+)$/.exec(auth);
  if (!match) throw new Error('Missing or invalid ingestion bearer token');
  const token = match[1];
  const keyId = match[2];
  const snapshot = await db.doc(\`businessIngestionKeys/${keyId}\`).get();
  const data = snapshot.data();
  if (!data?.active || !verifyIngestionKey(token, data.keyHash)) {
    throw new Error('Invalid or revoked ingestion key');
  }
  await consumeIngestionQuota(keyId);
  return {keyId, data, org: orgRoot(data.orgId)};
}

export const businessIngestionWebhook = onRequest(
  {region, secrets: [geminiKey], timeoutSeconds: 120, memory: '512MiB'},
  async (request, response) => {
    response.set('Cache-Control', 'no-store');
    if (request.method !== 'POST') {
      response.sendStatus(405);
      return;
    }
    try {
      if (Buffer.byteLength(JSON.stringify(request.body || {})) > 256 * 1024) {
        response.status(413).json({error: 'Payload too large'});
        return;
      }
      const {keyId, data, org} = await authenticateIngestionRequest(request);
      let extraction;
      if (Array.isArray(request.body?.records)) {
        extraction = normalizeExtraction({
          summary: String(request.body.summary || 'Structured IoT/API payload').slice(0, 2000),
          warnings: [],
          records: request.body.records,
        });
      } else {
        const text = safeTextInput(
          request.body?.text ||
          \`IoT/API JSON payload: ${JSON.stringify(request.body || {})}\`,
        );
        extraction = await geminiExtract({
          text,
          context: 'The source is an authenticated IoT/API payload. Never infer financial settlement from a sensor reading.',
        });
      }
      const proposal = await saveProposal(
        org,
        \`ingestion-key:${keyId}\`,
        'iot_api',
        extraction,
        {
          keyId,
          keyName: data.name || '',
          payloadHash: createHash('sha256').update(JSON.stringify(request.body || {})).digest('hex'),
        },
      );
      response.status(202).json({proposalId: proposal.id, state: 'review'});
    } catch (error) {
      response.status(401).json({error: String(error?.message || 'Ingestion failed').slice(0, 300)});
    }
  },
);
