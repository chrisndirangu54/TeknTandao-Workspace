import './index.js';
import {randomUUID} from 'node:crypto';
import {FieldValue, Timestamp, getFirestore} from 'firebase-admin/firestore';
import {HttpsError, onCall, onRequest} from 'firebase-functions/v2/https';
import {defineSecret} from 'firebase-functions/params';
import {catalog, canAccess, identifier, textValue} from './domain.js';
import {initializePaystack, verifyPaystack, verifyTransaction, initiateMpesa, queryMpesa} from './providers.js';
import {
  applyWebsitePatch,
  createBlankWebsiteDocument,
  generateFlutterFirebaseScaffold,
  validateWebsiteDocument,
  validateWebsiteTemplateMetadata,
  websiteDigest
} from './website_builder_domain.js';

const db = getFirestore();
const region = 'europe-west1';
const websiteAppId = 'mc14_website_builder';
const paystackSecret = defineSecret('PAYSTACK_SECRET_KEY');
const mpesaConfig = defineSecret('MPESA_CONFIG');
const geminiKey = defineSecret('GEMINI_API_KEY');
const stamp = () => FieldValue.serverTimestamp();
const orgRoot = orgId => db.doc(`organizations/${identifier(orgId)}`);
const publicSiteRef = publicId => db.doc(`publishedWebsiteSites/${identifier(publicId)}`);
const publicSiteOwnerRef = publicId => db.doc(`websitePublicSiteOwners/${identifier(publicId)}`);
const templateRef = templateId => db.doc(`websiteTemplates/${identifier(templateId)}`);
const purchaseRef = reference => db.doc(`websiteTemplatePurchases/${identifier(reference)}`);

function uid(request) {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in first');
  return request.auth.uid;
}

async function authorize(request, {ownerOnly = false, requireBuilder = true} = {}) {
  const user = uid(request);
  const org = orgRoot(request.data.orgId);
  const member = (await org.collection('members').doc(user).get()).data();
  if (!member || (ownerOnly && member.role !== 'owner')) throw new HttpsError('permission-denied', 'Organization access denied');
  if (requireBuilder) {
    const installation = (await org.collection('apps').doc(websiteAppId).get()).data();
    if (!canAccess(member, websiteAppId, installation)) throw new HttpsError('permission-denied', 'Website Builder subscription or permission required');
  }
  return {org, user, member};
}

function callable(handler, secrets = []) {
  return onCall({region, secrets}, async request => {
    try { return await handler(request); }
    catch (error) {
      if (error instanceof HttpsError) throw error;
      throw new HttpsError('failed-precondition', String(error?.message || 'Operation failed').slice(0, 1000));
    }
  });
}

function documentBytes(document) {
  return Buffer.byteLength(JSON.stringify(document), 'utf8');
}

function assertFirestoreSized(document) {
  if (documentBytes(document) > 750000) throw new Error('Website JSON is too large; split the design into smaller pages/components');
}

function publicIdValue(value) {
  const id = identifier(value || randomUUID());
  if (id.length < 3) throw new Error('Public site id is too short');
  return id;
}

function publicProject(project, id) {
  return {
    id,
    title: project.title,
    publicId: project.publicId,
    revision: project.revision || 1,
    publishedVersion: project.publishedVersion || 0,
    status: project.status || 'draft',
    updatedAt: project.updatedAt || null,
    publishedAt: project.publishedAt || null
  };
}

export const createWebsiteProject = callable(async request => {
  const {org, user} = await authorize(request);
  const title = textValue(request.data.title || 'New Website', 160);
  const projectId = identifier(request.data.projectId || randomUUID());
  const publicId = publicIdValue(request.data.publicId);
  const document = request.data.document ? validateWebsiteDocument(request.data.document) : createBlankWebsiteDocument(title);
  assertFirestoreSized(document);
  const projectRef = org.collection('websiteProjects').doc(projectId);
  const ownerRef = publicSiteOwnerRef(publicId);
  await db.runTransaction(async tx => {
    const [existing, ownerSnapshot] = await Promise.all([tx.get(projectRef), tx.get(ownerRef)]);
    if (existing.exists) throw new Error('Website project already exists');
    if (ownerSnapshot.exists) throw new Error('Public site id is already in use');
    tx.create(ownerRef, {publicId, orgId: org.id, projectId, reservedBy: user, reservedAt: stamp()});
    tx.create(projectRef, {
      projectId,
      title,
      publicId,
      draft: document,
      revision: 1,
      publishedVersion: 0,
      status: 'draft',
      createdBy: user,
      createdAt: stamp(),
      updatedBy: user,
      updatedAt: stamp()
    });
  });
  return {projectId, publicId, revision: 1};
});

export const patchWebsiteProject = callable(async request => {
  const {org, user} = await authorize(request);
  const projectId = identifier(request.data.projectId);
  const expectedRevision = request.data.expectedRevision;
  if (!Number.isInteger(expectedRevision) || expectedRevision < 1) throw new Error('Expected revision is required');
  const projectRef = org.collection('websiteProjects').doc(projectId);
  return db.runTransaction(async tx => {
    const snapshot = await tx.get(projectRef);
    if (!snapshot.exists) throw new Error('Website project not found');
    const project = snapshot.data();
    if (project.revision !== expectedRevision) throw new Error(`Revision conflict: server is at ${project.revision}`);
    const document = applyWebsitePatch(project.draft, request.data.patch);
    assertFirestoreSized(document);
    const nextRevision = expectedRevision + 1;
    tx.update(projectRef, {
      draft: document,
      title: document.title,
      revision: nextRevision,
      status: project.publishedVersion ? 'modified' : 'draft',
      updatedBy: user,
      updatedAt: stamp()
    });
    tx.set(org.collection('websiteProjectEvents').doc(`${projectId}_${nextRevision}`), {
      projectId,
      revision: nextRevision,
      patch: request.data.patch,
      actorUid: user,
      createdAt: stamp()
    });
    return {projectId, revision: nextRevision, digest: websiteDigest(document)};
  });
});

export const replaceWebsiteDocument = callable(async request => {
  const {org, user} = await authorize(request, {ownerOnly: true});
  const projectId = identifier(request.data.projectId);
  const expectedRevision = request.data.expectedRevision;
  if (!Number.isInteger(expectedRevision) || expectedRevision < 1) throw new Error('Expected revision is required');
  const document = validateWebsiteDocument(request.data.document);
  assertFirestoreSized(document);
  const ref = org.collection('websiteProjects').doc(projectId);
  return db.runTransaction(async tx => {
    const snapshot = await tx.get(ref);
    if (!snapshot.exists) throw new Error('Website project not found');
    if (snapshot.data().revision !== expectedRevision) throw new Error(`Revision conflict: server is at ${snapshot.data().revision}`);
    const revision = expectedRevision + 1;
    tx.update(ref, {draft: document, title: document.title, revision, status: snapshot.data().publishedVersion ? 'modified' : 'draft', updatedBy: user, updatedAt: stamp()});
    tx.set(org.collection('websiteProjectEvents').doc(`${projectId}_${revision}`), {projectId, revision, kind: 'replace_document', digest: websiteDigest(document), actorUid: user, createdAt: stamp()});
    return {projectId, revision, digest: websiteDigest(document)};
  });
});

export const publishWebsiteProject = callable(async request => {
  const {org, user} = await authorize(request, {ownerOnly: true});
  const projectId = identifier(request.data.projectId);
  const projectRef = org.collection('websiteProjects').doc(projectId);
  return db.runTransaction(async tx => {
    const projectSnapshot = await tx.get(projectRef);
    if (!projectSnapshot.exists) throw new Error('Website project not found');
    const project = projectSnapshot.data();
    const document = validateWebsiteDocument(project.draft);
    assertFirestoreSized(document);
    const version = (Number.isInteger(project.publishedVersion) ? project.publishedVersion : 0) + 1;
    const digest = websiteDigest(document);
    const globalRef = publicSiteRef(project.publicId);
    const ownerRef = publicSiteOwnerRef(project.publicId);
    const ownerSnapshot = await tx.get(ownerRef);
    const owner = ownerSnapshot.data();
    if (!ownerSnapshot.exists || owner.orgId !== org.id || owner.projectId !== projectId) throw new Error('Public site id ownership mismatch');
    tx.set(org.collection('websiteVersions').doc(`${projectId}_${version}`), {
      projectId,
      version,
      revision: project.revision,
      document,
      digest,
      publishedBy: user,
      publishedAt: stamp()
    });
    tx.set(globalRef, {
      publicId: project.publicId,
      version,
      revision: project.revision,
      digest,
      document,
      publishedAt: stamp()
    });
    tx.update(projectRef, {publishedVersion: version, publishedDigest: digest, status: 'published', publishedBy: user, publishedAt: stamp(), updatedAt: stamp()});
    return {projectId, publicId: project.publicId, version, revision: project.revision, digest};
  });
});

export const rollbackWebsiteProject = callable(async request => {
  const {org, user} = await authorize(request, {ownerOnly: true});
  const projectId = identifier(request.data.projectId);
  const version = request.data.version;
  if (!Number.isInteger(version) || version < 1) throw new Error('Invalid website version');
  const [projectSnapshot, versionSnapshot] = await Promise.all([
    org.collection('websiteProjects').doc(projectId).get(),
    org.collection('websiteVersions').doc(`${projectId}_${version}`).get()
  ]);
  if (!projectSnapshot.exists || !versionSnapshot.exists) throw new Error('Website version not found');
  const document = validateWebsiteDocument(versionSnapshot.data().document);
  const revision = (projectSnapshot.data().revision || 0) + 1;
  await org.collection('websiteProjects').doc(projectId).update({draft: document, title: document.title, revision, status: 'modified', updatedBy: user, updatedAt: stamp()});
  await org.collection('websiteProjectEvents').doc(`${projectId}_${revision}`).set({projectId, revision, kind: 'rollback', sourceVersion: version, actorUid: user, createdAt: stamp()});
  return {projectId, revision, sourceVersion: version};
});

export const getPublishedWebsite = onCall({region}, async request => {
  try {
    const publicId = publicIdValue(request.data.publicId);
    const snapshot = await publicSiteRef(publicId).get();
    if (!snapshot.exists) throw new HttpsError('not-found', 'Published website not found');
    const data = snapshot.data();
    return {publicId, version: data.version, revision: data.revision, digest: data.digest, document: data.document};
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    throw new HttpsError('invalid-argument', String(error?.message || 'Invalid request'));
  }
});

export const exportWebsiteFlutterScaffold = callable(async request => {
  const {org} = await authorize(request);
  const projectId = identifier(request.data.projectId);
  const snapshot = await org.collection('websiteProjects').doc(projectId).get();
  if (!snapshot.exists) throw new Error('Website project not found');
  const project = snapshot.data();
  const document = validateWebsiteDocument(project.draft);
  return {
    projectId,
    publicId: project.publicId,
    digest: websiteDigest(document),
    files: generateFlutterFirebaseScaffold(project.publicId, document)
  };
});

export const publishWebsiteTemplate = callable(async request => {
  const {org, user} = await authorize(request, {ownerOnly: true});
  const projectId = identifier(request.data.projectId);
  const metadata = validateWebsiteTemplateMetadata(request.data.metadata);
  const projectSnapshot = await org.collection('websiteProjects').doc(projectId).get();
  if (!projectSnapshot.exists) throw new Error('Website project not found');
  const document = validateWebsiteDocument(projectSnapshot.data().draft);
  assertFirestoreSized(document);
  const templateId = identifier(request.data.templateId || randomUUID());
  const ref = templateRef(templateId);
  const existing = await ref.get();
  if (existing.exists && existing.data().creatorUid !== user) throw new Error('Template id is already owned by another creator');
  const version = existing.exists ? (existing.data().version || 0) + 1 : 1;
  await ref.set({
    templateId,
    ...metadata,
    version,
    digest: websiteDigest(document),
    document,
    creatorUid: user,
    creatorOrgId: org.id,
    sourceProjectId: projectId,
    status: 'published',
    sales: existing.data()?.sales || 0,
    installs: existing.data()?.installs || 0,
    updatedAt: stamp(),
    ...(existing.exists ? {} : {createdAt: stamp()})
  }, {merge: true});
  return {templateId, version, digest: websiteDigest(document)};
});

export const unpublishWebsiteTemplate = callable(async request => {
  const {user} = await authorize(request, {ownerOnly: true});
  const templateId = identifier(request.data.templateId);
  const ref = templateRef(templateId);
  const snapshot = await ref.get();
  if (!snapshot.exists || snapshot.data().creatorUid !== user) throw new Error('Template not found');
  await ref.update({status: 'unpublished', updatedAt: stamp()});
  return {templateId, status: 'unpublished'};
});

export const getWebsiteTemplateMarketplace = callable(async request => {
  uid(request);
  const snapshots = await db.collection('websiteTemplates').where('status', '==', 'published').limit(100).get();
  return {
    templates: snapshots.docs.map(doc => {
      const item = doc.data();
      return {
        templateId: doc.id,
        name: item.name,
        description: item.description,
        category: item.category,
        creatorName: item.creatorName,
        priceMinor: item.priceMinor,
        currency: item.currency,
        license: item.license,
        tags: item.tags || [],
        version: item.version,
        digest: item.digest,
        sales: item.sales || 0,
        installs: item.installs || 0
      };
    })
  };
});

export const getWebsiteTemplatePreview = callable(async request => {
  uid(request);
  const templateId = identifier(request.data.templateId);
  const snapshot = await templateRef(templateId).get();
  if (!snapshot.exists || snapshot.data().status !== 'published') throw new Error('Template not found');
  const item = snapshot.data();
  return {templateId, name: item.name, version: item.version, digest: item.digest, document: item.document};
});

async function hasTemplateEntitlement(org, templateId) {
  return (await org.collection('websiteTemplateEntitlements').doc(templateId).get()).exists;
}

export const installWebsiteTemplate = callable(async request => {
  const {org, user} = await authorize(request);
  const templateId = identifier(request.data.templateId);
  const snapshot = await templateRef(templateId).get();
  if (!snapshot.exists || snapshot.data().status !== 'published') throw new Error('Template not found');
  const template = snapshot.data();
  if (template.priceMinor > 0 && !(await hasTemplateEntitlement(org, templateId))) throw new Error('Purchase this template before installing it');
  const projectId = identifier(request.data.projectId || randomUUID());
  const publicId = publicIdValue(request.data.publicId);
  const document = validateWebsiteDocument(template.document);
  const projectRef = org.collection('websiteProjects').doc(projectId);
  const ownerRef = publicSiteOwnerRef(publicId);
  await db.runTransaction(async tx => {
    const [projectExisting, ownerSnapshot] = await Promise.all([tx.get(projectRef), tx.get(ownerRef)]);
    if (projectExisting.exists) throw new Error('Website project already exists');
    if (ownerSnapshot.exists) throw new Error('Public site id is already in use');
    tx.create(ownerRef, {publicId, orgId: org.id, projectId, reservedBy: user, reservedAt: stamp()});
    tx.create(projectRef, {
      projectId,
      title: document.title,
      publicId,
      draft: document,
      revision: 1,
      publishedVersion: 0,
      status: 'draft',
      sourceTemplateId: templateId,
      sourceTemplateVersion: template.version,
      sourceTemplateDigest: template.digest,
      createdBy: user,
      createdAt: stamp(),
      updatedBy: user,
      updatedAt: stamp()
    });
    tx.update(templateRef(templateId), {installs: FieldValue.increment(1)});
  });
  return {projectId, publicId, templateId, revision: 1};
});

function marketplaceFeeBps() {
  const raw = Number(process.env.WEBSITE_MARKETPLACE_FEE_BPS || 0);
  return Number.isInteger(raw) && raw >= 0 && raw <= 5000 ? raw : 0;
}

async function settleTemplatePurchase(reference, providerVerification) {
  const ref = purchaseRef(reference);
  return db.runTransaction(async tx => {
    const purchaseSnapshot = await tx.get(ref);
    if (!purchaseSnapshot.exists) throw new Error('Template purchase not found');
    const purchase = purchaseSnapshot.data();
    if (purchase.state === 'paid') return {state: 'paid', templateId: purchase.templateId};
    const templateSnapshot = await tx.get(templateRef(purchase.templateId));
    if (!templateSnapshot.exists || templateSnapshot.data().status !== 'published') throw new Error('Template is no longer available');
    const template = templateSnapshot.data();
    if (template.priceMinor !== purchase.amountMinor || template.currency !== purchase.currency) throw new Error('Template price changed; start a new purchase');
    const buyerOrg = orgRoot(purchase.buyerOrgId);
    const sellerOrg = orgRoot(template.creatorOrgId);
    const entitlement = buyerOrg.collection('websiteTemplateEntitlements').doc(purchase.templateId);
    const earning = sellerOrg.collection('websiteTemplateEarnings').doc(reference);
    const feeBps = marketplaceFeeBps();
    const feeMinor = Math.floor(purchase.amountMinor * feeBps / 10000);
    const sellerNetMinor = purchase.amountMinor - feeMinor;
    tx.set(entitlement, {
      templateId: purchase.templateId,
      templateVersion: template.version,
      license: template.license,
      buyerUid: purchase.buyerUid,
      purchaseReference: reference,
      acquiredAt: stamp()
    }, {merge: true});
    tx.set(earning, {
      reference,
      templateId: purchase.templateId,
      buyerOrgId: purchase.buyerOrgId,
      grossMinor: purchase.amountMinor,
      platformFeeBps: feeBps,
      platformFeeMinor: feeMinor,
      sellerNetMinor,
      currency: purchase.currency,
      payoutState: 'pending_payout',
      createdAt: stamp()
    });
    tx.update(templateRef(purchase.templateId), {sales: FieldValue.increment(1)});
    tx.update(ref, {state: 'paid', paidAt: stamp(), providerVerification});
    return {state: 'paid', templateId: purchase.templateId, sellerNetMinor};
  });
}

export const startWebsiteTemplatePurchase = callable(async request => {
  const {org, user} = await authorize(request);
  const templateId = identifier(request.data.templateId);
  const provider = String(request.data.provider || 'paystack');
  if (!['paystack', 'mpesa'].includes(provider)) throw new Error('Use Paystack or M-Pesa');
  if (await hasTemplateEntitlement(org, templateId)) return {state: 'already_entitled', templateId};
  const snapshot = await templateRef(templateId).get();
  if (!snapshot.exists || snapshot.data().status !== 'published') throw new Error('Template not found');
  const template = snapshot.data();
  if (!Number.isSafeInteger(template.priceMinor) || template.priceMinor <= 0) throw new Error('This template does not require payment');
  if (template.creatorOrgId === org.id) throw new Error('Creators already own their own templates');
  const reference = identifier(`wt_${randomUUID()}`);
  const ref = purchaseRef(reference);
  await ref.create({
    reference,
    templateId,
    templateVersion: template.version,
    buyerOrgId: org.id,
    buyerUid: user,
    sellerOrgId: template.creatorOrgId,
    amountMinor: template.priceMinor,
    currency: 'KES',
    provider,
    state: 'initializing',
    createdAt: stamp()
  });
  try {
    if (provider === 'paystack') {
      const email = textValue(request.auth.token.email, 254);
      const result = await initializePaystack({secret: paystackSecret.value(), email, amount: template.priceMinor, reference});
      await ref.update({state: 'pending', authorizationUrl: result.authorization_url});
      return {reference, state: 'pending', url: result.authorization_url};
    }
    if (template.priceMinor % 100 !== 0) throw new Error('M-Pesa template prices must be whole KES amounts');
    const result = await initiateMpesa(JSON.parse(mpesaConfig.value()), {phone: textValue(request.data.phone, 30), amount: template.priceMinor / 100, reference});
    await ref.update({state: 'pending_reconciliation', checkoutRequestId: result.CheckoutRequestID});
    return {reference, state: 'pending_reconciliation', message: 'STK request sent. Complete payment and then check payment.'};
  } catch (error) {
    await ref.update({state: 'initialization_failed'});
    throw error;
  }
}, [paystackSecret, mpesaConfig]);

export const checkWebsiteTemplateMpesaPurchase = callable(async request => {
  const {org, user} = await authorize(request);
  const reference = identifier(request.data.reference);
  const ref = purchaseRef(reference);
  const snapshot = await ref.get();
  const purchase = snapshot.data();
  if (!purchase || purchase.buyerOrgId !== org.id || purchase.buyerUid !== user || purchase.provider !== 'mpesa') throw new Error('M-Pesa template purchase not found');
  if (purchase.state === 'paid') return {state: 'paid', templateId: purchase.templateId};
  if (!purchase.checkoutRequestId) throw new Error('Purchase has not been initialized');
  const result = await queryMpesa(JSON.parse(mpesaConfig.value()), purchase.checkoutRequestId);
  if (String(result.ResultCode) !== '0') return {state: 'pending_or_failed', message: 'No successful payment verified yet.'};
  return settleTemplatePurchase(reference, {provider: 'mpesa', resultCode: String(result.ResultCode), checkoutRequestId: purchase.checkoutRequestId});
}, [mpesaConfig]);

export const websiteTemplatePaystackWebhook = onRequest({region, secrets: [paystackSecret]}, async (req, res) => {
  if (req.method !== 'POST') { res.sendStatus(405); return; }
  if (!verifyPaystack(req.rawBody, req.get('x-paystack-signature'), paystackSecret.value())) { res.sendStatus(401); return; }
  if (req.body?.event !== 'charge.success') { res.sendStatus(200); return; }
  try {
    const reference = identifier(req.body.data.reference);
    const purchaseSnapshot = await purchaseRef(reference).get();
    const purchase = purchaseSnapshot.data();
    if (!purchase || purchase.provider !== 'paystack') { res.sendStatus(200); return; }
    const verified = await verifyTransaction(paystackSecret.value(), reference);
    if (verified.status !== 'success' || verified.reference !== reference || verified.amount !== purchase.amountMinor || verified.currency !== purchase.currency) throw new Error('Template payment mismatch');
    await settleTemplatePurchase(reference, {provider: 'paystack', transactionId: String(verified.id)});
    res.sendStatus(200);
  } catch (error) {
    console.error('Website template payment settlement failed', error);
    res.sendStatus(500);
  }
});

export const getWebsiteCreatorDashboard = callable(async request => {
  const {org, user} = await authorize(request, {ownerOnly: true});
  const [templates, earnings] = await Promise.all([
    db.collection('websiteTemplates').where('creatorUid', '==', user).limit(100).get(),
    org.collection('websiteTemplateEarnings').limit(500).get()
  ]);
  const earningRows = earnings.docs.map(doc => doc.data());
  const pendingMinor = earningRows.filter(row => row.payoutState === 'pending_payout').reduce((sum, row) => sum + (row.sellerNetMinor || 0), 0);
  const paidMinor = earningRows.filter(row => row.payoutState === 'paid_out').reduce((sum, row) => sum + (row.sellerNetMinor || 0), 0);
  return {
    templates: templates.docs.map(doc => ({templateId: doc.id, name: doc.data().name, status: doc.data().status, version: doc.data().version, sales: doc.data().sales || 0, installs: doc.data().installs || 0, priceMinor: doc.data().priceMinor || 0})),
    earnings: {pendingMinor, paidMinor, currency: 'KES', sales: earningRows.length},
    payoutState: 'manual_or_future_provider_payout'
  };
});

function extractGeminiJson(payload) {
  const text = payload?.candidates?.[0]?.content?.parts?.map(part => part.text || '').join('') || '';
  const stripped = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  if (!stripped) throw new Error('AI returned an empty website');
  return JSON.parse(stripped);
}

export const generateWebsiteFromPrompt = callable(async request => {
  await authorize(request, {ownerOnly: true});
  const prompt = textValue(request.data.prompt, 4000);
  const key = geminiKey.value();
  const model = process.env.GEMINI_MODEL;
  if (!key || !model) throw new Error('Configure GEMINI_API_KEY and GEMINI_MODEL before AI website generation');
  const schemaGuide = `Return JSON only. Build a responsive website document with schemaVersion 1, title, theme, settings, and pages. Each page has id,name,path,title,description,root. Each node has id,type,props,style,responsive,action,children. Allowed node types: page,section,container,row,column,wrap,stack,heading,text,richText,image,button,icon,divider,spacer,card,grid,navbar,hero,features,pricing,testimonials,cta,footer,form. Actions are none, navigate with path, or externalUrl with url. Do not include scripts, HTML, CSS, secrets, Firebase paths or arbitrary code. Use stable unique ids.`;
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: 'POST',
    headers: {'Content-Type': 'application/json', 'x-goog-api-key': key},
    body: JSON.stringify({contents: [{parts: [{text: `${schemaGuide}\n\nDesign brief:\n${prompt}`}]}], generationConfig: {responseMimeType: 'application/json', temperature: 0.7}})
  });
  if (!response.ok) throw new Error('AI website provider unavailable');
  const payload = await response.json();
  const document = validateWebsiteDocument(extractGeminiJson(payload));
  assertFirestoreSized(document);
  return {document, digest: websiteDigest(document)};
}, [geminiKey]);

export const getWebsiteBuilderOverview = callable(async request => {
  const {org, user} = await authorize(request);
  const [projects, entitlements] = await Promise.all([
    org.collection('websiteProjects').limit(100).get(),
    org.collection('websiteTemplateEntitlements').limit(200).get()
  ]);
  return {
    projects: projects.docs.map(doc => publicProject(doc.data(), doc.id)),
    entitlements: entitlements.docs.map(doc => ({templateId: doc.id, ...doc.data()})),
    capabilities: {
      runtimeJsonRendering: true,
      optimisticNodePatching: true,
      livePublishedFirestoreSnapshot: true,
      flutterFirebaseScaffoldExport: true,
      aiGenerationWhenConfigured: true,
      versionedPublishing: true,
      templateMarketplace: true,
      paystackTemplateCheckout: true,
      mpesaTemplateCheckout: true,
      creatorEarningsLedger: true,
      automatedCreatorPayouts: false
    },
    user
  };
});
