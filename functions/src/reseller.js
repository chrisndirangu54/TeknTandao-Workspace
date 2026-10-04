import './index.js';
import {randomUUID} from 'node:crypto';
import {FieldValue, Timestamp, getFirestore} from 'firebase-admin/firestore';
import {HttpsError, onCall, onRequest} from 'firebase-functions/v2/https';
import {onSchedule} from 'firebase-functions/v2/scheduler';
import {defineSecret} from 'firebase-functions/params';
import {z} from 'zod';
import {catalog, expandRequiredApps, identifier} from './domain.js';
import {compileWebsiteContent, componentLibraryVersion, exampleWebsiteContent, exportStaticWebsite, vettedComponents, vettedTemplates} from './website_components.js';
import {websiteDigest} from './website_builder_domain.js';
import {resellerPricingSchema, monthlyBundlePrice, domainCostMinor, generationPrice} from './reseller_pricing.js';
import {quoteNamecheapDomain, registerNamecheapDomain, registrantSchema} from './namecheap.js';
import {initializePaystack, verifyTransaction, verifyPaystack} from './providers.js';
import {resellerHostingDomains, desiredHostingDns} from './website_builder_advanced.js';

const db = getFirestore(), region = 'europe-west1';
const registrarSecret = defineSecret('NAMECHEAP_CONFIG');
const paymentSecret = defineSecret('PAYSTACK_SECRET_KEY');
const stamp = () => FieldValue.serverTimestamp();
const root = id => db.doc(`organizations/${identifier(id)}`);
const periodSchema = z.string().regex(/^20\d{2}-(0[1-9]|1[0-2])$/);
const currentPeriod = () => new Date().toISOString().slice(0, 7);
const publicRow = doc => ({...doc.data(), id: doc.id});
const networkOptions = process.env.NAMECHEAP_VPC_CONNECTOR ? {vpcConnector: process.env.NAMECHEAP_VPC_CONNECTOR, vpcConnectorEgressSettings: 'ALL_TRAFFIC'} : {};
function callable(work, secrets = [], network = false) {
  return onCall({region, timeoutSeconds: 120, secrets, ...(network ? networkOptions : {})}, async request => {
    try { return await work(request); }
    catch (error) { if (error instanceof HttpsError) throw error; throw new HttpsError('failed-precondition', error instanceof z.ZodError ? 'Invalid input. Check the required fields.' : String(error.message || 'Request failed').slice(0, 500)); }
  });
}
async function authorize(request, reseller = false) {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in first');
  const org = root(request.data.orgId), uid = request.auth.uid;
  if ((await org.collection('members').doc(uid).get()).data()?.role !== 'owner') throw new HttpsError('permission-denied', 'Workspace owner access required');
  if (reseller && !(await db.doc(`resellerAccounts/${org.id}`).get()).data()?.enabled) throw new HttpsError('permission-denied', 'This workspace needs platform-approved reseller access');
  return {org, uid};
}
async function pricing(org) {
  const policy = (await org.collection('resellerSettings').doc('pricing').get()).data()?.policy;
  if (!policy) throw new Error('Configure cost and profit rates first');
  return resellerPricingSchema.parse(policy);
}
export const setResellerAccount = callable(async request => {
  if (request.auth?.token?.platformAdmin !== true) throw new HttpsError('permission-denied', 'Platform administrator required');
  await db.doc(`resellerAccounts/${identifier(request.data.workspaceId)}`).set({enabled: request.data.enabled === true, updatedBy: request.auth.uid, updatedAt: stamp()});
  return {ok: true};
});
export const getResellerStudio = callable(async request => {
  const {org} = await authorize(request);
  const [account, policy, library, projects, sold, bought, invoices, usage, costs] = await Promise.all([
    db.doc(`resellerAccounts/${org.id}`).get(), org.collection('resellerSettings').doc('pricing').get(),
    org.collection('vettedSiteTemplates').limit(100).get(), org.collection('websiteProjects').limit(100).get(),
    db.collection('resellerBundles').where('sellerOrgId', '==', org.id).limit(100).get(),
    db.collection('resellerBundles').where('clientOrgId', '==', org.id).limit(100).get(),
    db.collection('resellerInvoices').where('sellerOrgId', '==', org.id).limit(100).get(),
    org.collection('siteGenerationUsage').orderBy('createdAt', 'desc').limit(30).get(),
    org.collection('clientFirebaseCosts').limit(100).get(),
  ]);
  return {enabled: account.data()?.enabled === true, pricing: policy.data()?.policy || null,
    components: vettedComponents, presets: vettedTemplates, library: library.docs.map(publicRow),
    projects: projects.docs.map(doc => ({id: doc.id, title: doc.data().title, hasBlueprint: !!doc.data().contentBlueprint})),
    sold: sold.docs.map(publicRow), bought: bought.docs.map(publicRow), invoices: invoices.docs.map(publicRow), usage: usage.docs.map(publicRow), costs: costs.docs.map(publicRow),
    apps: Object.entries(catalog).map(([id, app]) => ({id, name: app.name})),
  };
});
export const saveResellerPricing = callable(async request => {
  const {org, uid} = await authorize(request, true);
  const policy = resellerPricingSchema.parse(request.data.policy);
  await org.collection('resellerSettings').doc('pricing').set({policy, updatedBy: uid, updatedAt: stamp()});
  return {policy};
});
export const priceResellerGeneration = callable(async request => {
  const {org, uid} = await authorize(request, true);
  const policy = await pricing(org);
  const ref = org.collection('siteGenerationUsage').doc(identifier(request.data.generationId));
  return db.runTransaction(async tx => {
    const usage = (await tx.get(ref)).data();
    if (!usage || usage.status !== 'validated' || !usage.blueprint || !usage.usage) throw new Error('A validated site with actual provider token usage is required');
    if (usage.charge) return {charge: usage.charge};
    const charge = generationPrice(usage.usage, policy, usage.model);
    tx.update(ref, {charge, pricingPending: false, pricedBy: uid, pricedAt: stamp()});
    return {charge};
  });
});
export const recordResellerFirebaseCost = callable(async request => {
  const {org, uid} = await authorize(request, true);
  const input = z.object({clientWorkspaceId: z.string().min(1).max(100), period: periodSchema, amountMinor: z.number().int().min(0).max(1000000000), source: z.string().min(5).max(500), estimated: z.boolean()}).strict().parse(request.data.cost);
  identifier(input.clientWorkspaceId);
  // Allocation is explicit: shared-project totals must never be attributed to
  // every customer as though each consumed the whole Firebase bill.
  await org.collection('clientFirebaseCosts').doc(`${input.clientWorkspaceId}_${input.period}`).set({...input, recordedBy: uid, recordedAt: stamp()});
  return {ok: true};
});
export const saveVettedSiteTemplate = callable(async request => {
  const {org, uid} = await authorize(request);
  const project = (await org.collection('websiteProjects').doc(identifier(request.data.projectId)).get()).data();
  if (!project?.contentBlueprint) throw new Error('Generate or install a content-template site first');
  const compiled = compileWebsiteContent(project.contentBlueprint);
  if (websiteDigest(compiled.document) !== websiteDigest(project.draft)) throw new Error('The site has layout edits outside the vetted library. Regenerate structured content before saving a vetted template.');
  const name = z.string().trim().min(1).max(120).parse(request.data.name);
  const ref = org.collection('vettedSiteTemplates').doc();
  await ref.set({name, blueprint: compiled.blueprint, componentLibraryVersion, sourceProjectId: request.data.projectId, sourceRevision: project.revision, digest: websiteDigest(compiled.document), version: 1, createdBy: uid, createdAt: stamp()});
  return {id: ref.id};
});
export const installVettedSiteTemplate = callable(async request => {
  const {org, uid} = await authorize(request);
  let blueprint;
  if (request.data.presetId) blueprint = exampleWebsiteContent(request.data.presetId);
  else blueprint = (await org.collection('vettedSiteTemplates').doc(identifier(request.data.templateId)).get()).data()?.blueprint;
  const compiled = compileWebsiteContent(blueprint);
  const projectId = randomUUID(), publicId = randomUUID();
  const batch = db.batch();
  batch.create(org.collection('websiteProjects').doc(projectId), {title: compiled.document.title, publicId, draft: compiled.document, contentBlueprint: compiled.blueprint, revision: 1, status: 'draft', publishedVersion: 0, createdBy: uid, createdAt: stamp(), updatedAt: stamp()});
  batch.create(db.doc(`websitePublicSiteOwners/${publicId}`), {orgId: org.id, projectId});
  await batch.commit();
  return {projectId, publicId};
});
export const exportVettedSite = callable(async request => {
  const {org} = await authorize(request);
  const project = (await org.collection('websiteProjects').doc(identifier(request.data.projectId)).get()).data();
  if (!project?.contentBlueprint) throw new Error('This site has no structured content blueprint');
  if (websiteDigest(compileWebsiteContent(project.contentBlueprint).document) !== websiteDigest(project.draft)) throw new Error('Save a matching structured-content site before exporting');
  return {files: exportStaticWebsite(project.contentBlueprint)};
});

export const quoteResellerDomain = callable(async request => {
  const {org, uid} = await authorize(request, true);
  const policy = await pricing(org);
  const config = JSON.parse(registrarSecret.value());
  if (!config.sandbox && !process.env.NAMECHEAP_VPC_CONNECTOR) throw new Error('Configure static IPv4 egress before live Namecheap requests');
  const quote = await quoteNamecheapDomain(config, request.data.domain);
  const ref = org.collection('registrarQuotes').doc();
  const expiresAt = Timestamp.fromMillis(Date.now() + 15 * 60000);
  const cost = domainCostMinor(quote.amountUsd, policy.usdToKes);
  await ref.set({...quote, costMinor: cost, currency: 'KES', usdToKes: policy.usdToKes, expiresAt, createdBy: uid, createdAt: stamp()});
  return {id: ref.id, ...quote, costMinor: cost, currency: 'KES', expiresAt: expiresAt.toMillis()};
}, [registrarSecret], true);

export const createResellerBundle = callable(async request => {
  const {org, uid} = await authorize(request, true);
  const input = z.object({name: z.string().min(1).max(120), clientWorkspaceId: z.string().min(1).max(100), projectId: z.string().min(1).max(100), apps: z.array(z.string()).max(30), domainQuoteId: z.string().nullable().default(null), generationId: z.string().nullable().default(null)}).strict().parse(request.data.bundle);
  const clientOrgId = identifier(input.clientWorkspaceId);
  if (clientOrgId === org.id) throw new Error('Select a separate client workspace');
  if (!(await root(clientOrgId).get()).exists) throw new Error('Client workspace does not exist');
  const policy = await pricing(org);
  const project = (await org.collection('websiteProjects').doc(identifier(input.projectId)).get()).data();
  if (!project?.contentBlueprint) throw new Error('Choose a vetted-template website');
  const compiled = compileWebsiteContent(project.contentBlueprint);
  if (websiteDigest(compiled.document) !== websiteDigest(project.draft)) throw new Error('Site differs from its vetted blueprint');
  const apps = expandRequiredApps([...input.apps, 'mc14_website_builder']);
  let domainQuote = null, generationCharge = null;
  if (input.domainQuoteId) {
    domainQuote = (await org.collection('registrarQuotes').doc(identifier(input.domainQuoteId)).get()).data();
    if (!domainQuote || domainQuote.expiresAt.toMillis() < Date.now()) throw new Error('Refresh the domain quote');
    if (domainQuote.sandbox) throw new Error('Sandbox domain quotes cannot be sold to clients');
  }
  if (input.generationId) {
    const usage = (await org.collection('siteGenerationUsage').doc(identifier(input.generationId)).get()).data();
    if (usage?.status !== 'validated' || !usage.charge || websiteDigest(compileWebsiteContent(usage.blueprint).document) !== websiteDigest(compiled.document)) throw new Error('Choose a priced generation record matching this site');
    generationCharge = usage.charge;
  }
  const ref = db.collection('resellerBundles').doc();
  await ref.create({name: input.name, sellerOrgId: org.id, clientOrgId, sourceProjectId: input.projectId, blueprint: compiled.blueprint, document: compiled.document, apps, policy, domainQuote, generationCharge, status: 'offered', domainStatus: domainQuote ? 'awaiting_payment' : 'not_requested', createdBy: uid, createdAt: stamp()});
  return {id: ref.id};
});

async function createInvoice(bundleRef, period) {
  const bundle = (await bundleRef.get()).data();
  if (!bundle || !['offered', 'active'].includes(bundle.status)) throw new Error('Bundle is not available for invoicing');
  const cost = (await root(bundle.sellerOrgId).collection('clientFirebaseCosts').doc(`${bundle.clientOrgId}_${period}`).get()).data();
  if (!cost) throw new Error('Record the client’s allocated Firebase cost for this month first');
  const monthly = monthlyBundlePrice(cost.amountMinor, bundle.policy);
  const ref = db.collection('resellerInvoices').doc(`${bundleRef.id}_${period}`);
  await db.runTransaction(async tx => {
    if ((await tx.get(ref)).exists) return;
    const fresh = (await tx.get(bundleRef)).data();
    if (!fresh || !['offered', 'active'].includes(fresh.status)) throw new Error('Bundle is no longer available');
    const onboarding = !fresh.firstInvoiceId;
    const generationMinor = onboarding ? fresh.generationCharge?.totalMinor || 0 : 0;
    const domainMinor = onboarding ? fresh.domainQuote?.costMinor || 0 : 0;
    const totalMinor = monthly.totalMinor + generationMinor + domainMinor;
    if (!Number.isSafeInteger(totalMinor) || totalMinor <= 0 || totalMinor > 1000000000) throw new Error('Invoice total must be positive and within the supported limit');
    tx.create(ref, {bundleId: bundleRef.id, sellerOrgId: bundle.sellerOrgId, clientOrgId: bundle.clientOrgId, period, monthly, firebaseCostSource: cost.source, estimated: cost.estimated, generationMinor, domainMinor, totalMinor, currency: 'KES', status: 'due', createdAt: stamp()});
    if (onboarding) tx.update(bundleRef, {firstInvoiceId: ref.id});
  });
  return {id: ref.id, ...(await ref.get()).data()};
}
export const createResellerInvoice = callable(async request => {
  const {org} = await authorize(request, true);
  const ref = db.collection('resellerBundles').doc(identifier(request.data.bundleId));
  if ((await ref.get()).data()?.sellerOrgId !== org.id) throw new HttpsError('permission-denied', 'Bundle not owned by this reseller');
  return createInvoice(ref, periodSchema.parse(request.data.period || currentPeriod()));
});
export const getClientBundleInvoices = callable(async request => {
  const {org} = await authorize(request);
  const snapshots = await db.collection('resellerInvoices').where('clientOrgId', '==', org.id).limit(100).get();
  return {invoices: snapshots.docs.map(publicRow)};
});
export const startResellerInvoicePayment = callable(async request => {
  const {org, uid} = await authorize(request);
  const id = identifier(request.data.invoiceId), ref = db.collection('resellerInvoices').doc(id);
  const invoice = (await ref.get()).data();
  if (invoice?.clientOrgId !== org.id || invoice.status !== 'due') throw new Error('Payable invoice not found');
  const reference = randomUUID();
  const email = z.string().email().parse(request.auth.token.email);
  const existing = await db.runTransaction(async tx => {
    const fresh = (await tx.get(ref)).data();
    const bundle = (await tx.get(db.doc(`resellerBundles/${fresh.bundleId}`))).data();
    if (fresh.status !== 'due' || !['offered', 'active'].includes(bundle?.status)) throw new Error('Invoice is no longer payable');
    if (fresh.checkout) return fresh.checkout;
    tx.update(ref, {checkout: {reference, status: 'initializing'}});
    tx.create(db.collection('resellerPaymentReferences').doc(reference), {invoiceId: id, clientOrgId: org.id, uid, totalMinor: invoice.totalMinor, createdAt: stamp()});
    return null;
  });
  if (existing?.url) return existing;
  if (existing) throw new Error('Checkout is initializing or needs provider review; do not start another payment');
  try {
    const result = await initializePaystack({secret: paymentSecret.value(), email, amount: invoice.totalMinor, reference});
    const checkout = {reference, url: result.authorization_url, status: 'ready'};
    await ref.update({checkout});
    return checkout;
  } catch {
    await ref.update({'checkout.status': 'needs_review'});
    throw new Error('Checkout outcome needs provider review. The payment reference is preserved to prevent duplicate charges.');
  }
}, [paymentSecret]);

export async function settleResellerPayment(reference, verified) {
  const payment = (await db.collection('resellerPaymentReferences').doc(identifier(reference)).get()).data();
  if (!payment) throw new Error('Payment reference not found');
  if (verified.status !== 'success' || verified.reference !== reference || verified.amount !== payment.totalMinor || verified.currency !== 'KES') throw new Error('Payment verification mismatch');
  return db.runTransaction(async tx => {
    const invoiceRef = db.collection('resellerInvoices').doc(payment.invoiceId);
    const invoice = (await tx.get(invoiceRef)).data();
    if (!invoice || invoice.totalMinor !== verified.amount) throw new Error('Invoice mismatch');
    if (invoice.status === 'paid') {
      if (invoice.paymentReference !== reference) tx.set(db.doc(`resellerPaymentReviews/${reference}`), {invoiceId: payment.invoiceId, reason: 'duplicate_payment', createdAt: stamp()});
      return {status: 'paid', duplicate: true};
    }
    if (invoice.status !== 'due') throw new Error('Invoice is no longer payable');
    const bundleRef = db.collection('resellerBundles').doc(invoice.bundleId), bundle = (await tx.get(bundleRef)).data();
    if (!bundle || !['offered', 'active'].includes(bundle.status)) throw new Error('Bundle is no longer active');
    const client = root(bundle.clientOrgId), projectId = `bundle_${invoice.bundleId}`, publicId = `bundle_${invoice.bundleId}`;
    const projectRef = client.collection('websiteProjects').doc(projectId), existingProject = await tx.get(projectRef);
    const publicRef = db.doc(`publishedWebsiteSites/${publicId}`), existingPublic = await tx.get(publicRef);
    const appRefs = bundle.apps.map(id => client.collection('apps').doc(id));
    const installed = await Promise.all(appRefs.map(ref => tx.get(ref)));
    const expiresAt = Timestamp.fromMillis(Math.max(Date.now(), bundle.paidThrough?.toMillis?.() || 0) + 30 * 86400000);
    installed.forEach((snapshot, index) => {
      const appId = bundle.apps[index];
      const existingExpiry = snapshot.data()?.state === 'paid' ? snapshot.data().expiresAt?.toMillis?.() || 0 : 0;
      tx.set(appRefs[index], {appId, state: 'paid', expiresAt: Timestamp.fromMillis(Math.max(existingExpiry, expiresAt.toMillis())), shares: catalog[appId].shares, resellerBundleId: invoice.bundleId}, {merge: true});
    });
    if (!existingProject.exists) {
      tx.create(projectRef, {title: bundle.document.title, draft: bundle.document, contentBlueprint: bundle.blueprint, publicId, revision: 1, status: 'published', publishedVersion: 1, managedBundleId: invoice.bundleId, createdAt: stamp(), updatedAt: stamp()});
      tx.create(db.doc(`websitePublicSiteOwners/${publicId}`), {orgId: client.id, projectId});
    }
    if (!existingPublic.exists) tx.set(publicRef, bundle.suspendedPublication || {publicId, document: bundle.document, version: 1, revision: 1, managedBundleId: invoice.bundleId, publishedAt: stamp()});
    tx.update(bundleRef, {status: 'active', paidThrough: expiresAt, clientProjectId: projectId, publicId, updatedAt: stamp()});
    tx.update(invoiceRef, {status: 'paid', paidAt: stamp(), paymentReference: reference, providerTransactionId: String(verified.id)});
    tx.set(root(bundle.sellerOrgId).collection('resellerEarnings').doc(payment.invoiceId), {bundleId: invoice.bundleId, invoiceId: payment.invoiceId, grossMinor: invoice.totalMinor, profitMinor: invoice.monthly.profitMinor + (invoice.generationMinor ? bundle.generationCharge?.profitMinor || 0 : 0), currency: 'KES', status: 'recorded', createdAt: stamp()});
    return {status: 'paid', publicId, expiresAt: expiresAt.toMillis()};
  });
}
export const checkResellerInvoicePayment = callable(async request => {
  const {org} = await authorize(request);
  const ref = identifier(request.data.reference);
  if ((await db.collection('resellerPaymentReferences').doc(ref).get()).data()?.clientOrgId !== org.id) throw new HttpsError('permission-denied', 'Payment not owned by this workspace');
  return settleResellerPayment(ref, await verifyTransaction(paymentSecret.value(), ref));
}, [paymentSecret]);
export const resellerPaystackWebhook = onRequest({region, secrets: [paymentSecret]}, async (request, response) => {
  if (request.method !== 'POST') return response.sendStatus(405);
  if (!verifyPaystack(request.rawBody, request.get('x-paystack-signature'), paymentSecret.value())) return response.sendStatus(401);
  if (request.body?.event !== 'charge.success') return response.sendStatus(200);
  try { const ref = identifier(request.body.data.reference); if (!(await db.collection('resellerPaymentReferences').doc(ref).get()).exists) return response.sendStatus(200); await settleResellerPayment(ref, await verifyTransaction(paymentSecret.value(), ref)); response.sendStatus(200); }
  catch { response.sendStatus(500); }
});
export const cancelResellerBundle = callable(async request => {
  const {org, uid} = await authorize(request);
  const ref = db.collection('resellerBundles').doc(identifier(request.data.bundleId));
  await db.runTransaction(async tx => {
    const bundle = (await tx.get(ref)).data();
    if (!bundle || ![bundle.sellerOrgId, bundle.clientOrgId].includes(org.id)) throw new HttpsError('permission-denied', 'Bundle access denied');
    tx.update(ref, {status: 'cancelled', cancelledBy: uid, cancelledAt: stamp()});
  });
  return {ok: true};
});

export const registerResellerDomain = callable(async request => {
  const {org, uid} = await authorize(request, true);
  if (request.data.confirmPurchase !== true) throw new Error('Explicit domain purchase confirmation is required');
  const ref = db.collection('resellerBundles').doc(identifier(request.data.bundleId));
  const bundle = (await ref.get()).data();
  if (bundle?.sellerOrgId !== org.id || bundle.status !== 'active' || !bundle.domainQuote) throw new Error('A paid domain bundle is required');
  if (bundle.domainStatus === 'registered') return {status: 'registered', domain: bundle.domainQuote.domain};
  const firstInvoice = (await db.doc(`resellerInvoices/${bundle.firstInvoiceId}`).get()).data();
  if (firstInvoice?.status !== 'paid' || firstInvoice.domainMinor !== bundle.domainQuote.costMinor) throw new Error('The domain invoice must be paid before registration');
  const contact = registrantSchema.parse(request.data.contact);
  const config = JSON.parse(registrarSecret.value());
  if (config.sandbox || !process.env.NAMECHEAP_VPC_CONNECTOR) throw new Error('Live reseller registration requires production Namecheap configuration and static IPv4 egress');
  const fresh = await quoteNamecheapDomain(config, bundle.domainQuote.domain);
  if (fresh.amountUsd > bundle.domainQuote.amountUsd) throw new Error('Registrar price increased. Review the customer quote before purchasing.');
  await db.runTransaction(async tx => {
    const current = (await tx.get(ref)).data();
    if (current.status !== 'active' || current.domainStatus !== 'awaiting_payment') throw new Error('Registration is unavailable or already attempted; inspect Namecheap before retrying');
    tx.update(ref, {domainStatus: 'registering', registrationStartedBy: uid, registrationStartedAt: stamp()});
  });
  try {
    const result = await registerNamecheapDomain(config, bundle.domainQuote.domain, contact);
    await ref.update({domainStatus: 'registered', registrar: result, domainRenewsAfter: Timestamp.fromMillis(Date.now() + 365 * 86400000), dnsStatus: 'configuration_required'});
    return result;
  } catch { await ref.update({domainStatus: 'needs_review'}); throw new Error('Registration outcome needs review in Namecheap. It will not be retried automatically.'); }
}, [registrarSecret], true);

export const connectResellerDomain = callable(async request => {
  const {org, uid} = await authorize(request);
  const ref = db.collection('resellerBundles').doc(identifier(request.data.bundleId));
  const bundle = (await ref.get()).data();
  if (!bundle || ![bundle.sellerOrgId, bundle.clientOrgId].includes(org.id) || bundle.domainStatus !== 'registered' || bundle.status !== 'active' || bundle.paidThrough.toMillis() <= Date.now()) throw new Error('An active paid bundle with a registered domain is required');
  const domain = bundle.domainQuote.domain;
  const mappingRef = db.doc(`publishedWebsiteDomains/${domain}`);
  await db.runTransaction(async tx => {
    const current = (await tx.get(mappingRef)).data();
    if (current && current.publicId !== bundle.publicId) throw new Error('Domain is already assigned to another site');
    tx.set(mappingRef, {domain, publicId: bundle.publicId, orgId: bundle.clientOrgId, active: current?.active || false}, {merge: true});
  });
  let state = await resellerHostingDomains.get(domain);
  if (!state) { await resellerHostingDomains.create(domain); state = await resellerHostingDomains.get(domain); }
  const requiredDns = state ? desiredHostingDns(state) : [];
  const active = state?.hostState === 'HOST_ACTIVE' && state?.ownershipState === 'OWNERSHIP_ACTIVE' && ['CERT_ACTIVE', 'CERT_EXPIRING_SOON'].includes(state?.cert?.state);
  await root(bundle.clientOrgId).collection('websiteDomains').doc(domain).set({domain, publicId: bundle.publicId, projectId: bundle.clientProjectId, dnsProvider: 'manual', requiredDns, active, requestedBy: uid, updatedAt: stamp()}, {merge: true});
  await mappingRef.set({active, updatedAt: stamp()}, {merge: true});
  await ref.update({dnsStatus: active ? 'active' : 'configuration_required'});
  return {domain, active, requiredDns, hostState: state?.hostState || 'provisioning', certState: state?.cert?.state || 'pending', instruction: 'Add the required DNS records in Namecheap Advanced DNS, then check again. TLS and DNS propagation may take time.'};
});

export const maintainResellerSubscriptions = onSchedule({region, schedule: 'every 24 hours', timeZone: 'Africa/Nairobi'}, async () => {
  const snapshots = await db.collection('resellerBundles').where('status', 'in', ['active', 'cancelled']).limit(500).get();
  for (const doc of snapshots.docs) {
    const bundle = doc.data();
    if (bundle.paidThrough?.toMillis() < Date.now()) {
      if (bundle.publicId) await db.runTransaction(async tx => {
        const fresh = (await tx.get(doc.ref)).data();
        const publicRef = db.doc(`publishedWebsiteSites/${bundle.publicId}`);
        const publication = await tx.get(publicRef);
        if (fresh.paidThrough?.toMillis() < Date.now() && publication.exists) {
          tx.update(doc.ref, {suspendedPublication: publication.data()});
          tx.delete(publicRef);
        }
      });
      // App entitlements expire independently via existing access checks.
    }
    if (bundle.status === 'active') {
      try { await createInvoice(doc.ref, currentPeriod()); }
      catch { await doc.ref.update({billingStatus: 'cost_allocation_required'}); }
    }
  }
});
