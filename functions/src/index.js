import {initializeApp} from 'firebase-admin/app';
import {getFirestore, Timestamp, FieldValue} from 'firebase-admin/firestore';
import {getAuth} from 'firebase-admin/auth';
import {onCall, onRequest, HttpsError} from 'firebase-functions/v2/https';
import {onDocumentCreated} from 'firebase-functions/v2/firestore';
import {defineSecret} from 'firebase-functions/params';
import {randomUUID} from 'node:crypto';
import {catalog, identifier, textValue, money, quote, canAccess, saleTotal} from './domain.js';
import {initializePaystack, verifyPaystack, verifyTransaction, initiateMpesa, queryMpesa} from './providers.js';

initializeApp();
const db = getFirestore();
const paystackSecret = defineSecret('PAYSTACK_SECRET_KEY');
const mpesaConfig = defineSecret('MPESA_CONFIG');
const geminiKey = defineSecret('GEMINI_API_KEY');
const region = 'europe-west1';
const stamp = () => FieldValue.serverTimestamp();
const root = org => db.doc(`organizations/${identifier(org)}`);
function uid(request) {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in first');
  return request.auth.uid;
}
async function authorize(request, app, ownerOnly = false) {
  const user = uid(request);
  const org = root(request.data.orgId);
  const member = (await org.collection('members').doc(user).get()).data();
  if (!member || (ownerOnly && member.role !== 'owner')) throw new HttpsError('permission-denied', 'Organization access denied');
  if (app && !canAccess(member, app, (await org.collection('apps').doc(app).get()).data())) throw new HttpsError('permission-denied', 'App subscription or permission required');
  return {org, user, member};
}
function callable(handler, secrets = []) {
  return onCall({region, secrets}, async request => {
    try { return await handler(request); }
    catch (e) {
      if (e instanceof HttpsError) throw e;
      // Do not return provider responses, credentials, or internal stack traces.
      throw new HttpsError('failed-precondition', e.message?.startsWith('Provider') ? 'Provider unavailable; retry later' : e.message);
    }
  });
}
export const getCatalog = callable(async request => { uid(request); return {catalog, pricing: 'Provisional KES monthly prices; 10% for 3–5 apps, 20% for 6+.'}; });
export const createOrganization = callable(async request => {
  const user = uid(request);
  const name = textValue(request.data.name);
  // One self-service organization per account in this initial release.
  const org = root(user);
  await db.runTransaction(async tx => {
    if ((await tx.get(org)).exists) return;
    tx.create(org, {name, createdAt: stamp(), owner: user, currency: 'KES'});
    tx.create(org.collection('members').doc(user), {role: 'owner', apps: []});
    tx.set(db.doc(`users/${user}`), {orgId: user});
  });
  return {orgId: user};
});
export const grantMember = callable(async request => {
  const {org, user} = await authorize(request, null, true);
  const target = request.data.email ? (await getAuth().getUserByEmail(textValue(request.data.email, 254))).uid : identifier(request.data.uid);
  if (target === user) throw new Error('Cannot change your own membership');
  const apps = request.data.apps;
  if (!Array.isArray(apps) || apps.some(a => !Object.hasOwn(catalog, a))) throw new Error('Invalid app permissions');
  await org.collection('members').doc(target).set({role: 'member', apps: [...new Set(apps)], updatedAt: stamp()});
  return {ok: true};
});
export const getWorkspaceContext = callable(async request => {
  const {org, user, member} = await authorize(request);
  return {orgId: org.id, uid: user, role: member.role, apps: member.apps || [], name: (await org.get()).data().name};
});
export const installApp = callable(async request => {
  const {org} = await authorize(request, null, true);
  const app = identifier(request.data.appId);
  if (!Object.hasOwn(catalog, app)) throw new Error('Unknown app');
  const ref = org.collection('apps').doc(app);
  await db.runTransaction(async tx => {
    const current = await tx.get(ref);
    if (current.exists) return; // Dragging again never resets a trial or paid term.
    tx.create(ref, {appId: app, state: 'trial', installedAt: stamp(), expiresAt: Timestamp.fromMillis(Date.now() + 14 * 86400000), shares: catalog[app].shares});
  });
  return {ok: true};
});
export const getQuote = callable(async request => { await authorize(request, null, true); return quote(request.data.apps); });
export const saveRecord = callable(async request => {
  const app = identifier(request.data.appId);
  if (!Object.hasOwn(catalog, app)) throw new Error('Unknown app');
  const {org, user} = await authorize(request, app);
  const id = identifier(request.data.id || randomUUID());
  const input = request.data.record;
  const data = {name: textValue(input?.name), updatedAt: stamp(), updatedBy: user};
  let collection = org.collection('modules').doc(app).collection('records');
  if (app === 'crm') {
    collection = org.collection('contacts');
    data.email = input.email ? textValue(input.email, 254) : '';
  } else if (app === 'inventory') {
    collection = org.collection('products');
    data.price = money(input.price);
    if (!Number.isSafeInteger(input.stock) || input.stock < 0 || input.stock > 10000000) throw new Error('Invalid stock');
    data.stock = input.stock;
  } else if (['pos', 'accounting'].includes(app)) {
    throw new Error('Use the sale workflow to create sales and invoices');
  } else {
    data.note = input.note ? textValue(input.note, 2000) : '';
  }
  await collection.doc(id).set(data, {merge: true});
  return {id};
});
export const createSale = callable(async request => {
  const {org, user} = await authorize(request, 'pos');
  const id = identifier(request.data.requestId);
  const productRef = org.collection('products').doc(identifier(request.data.productId));
  const contactRef = org.collection('contacts').doc(identifier(request.data.contactId));
  const saleRef = org.collection('sales').doc(id);
  return db.runTransaction(async tx => {
    const [existing, productSnap, contactSnap] = await Promise.all([tx.get(saleRef), tx.get(productRef), tx.get(contactRef)]);
    if (existing.exists) return {id, total: existing.data().total};
    if (!productSnap.exists || !contactSnap.exists) throw new Error('Select an existing product and customer');
    const product = productSnap.data();
    const total = saleTotal(product, request.data.quantity);
    tx.update(productRef, {stock: product.stock - request.data.quantity, updatedAt: stamp()});
    tx.create(saleRef, {productId: productRef.id, contactId: contactRef.id, quantity: request.data.quantity, total, currency: 'KES', paymentState: 'unpaid', createdAt: stamp(), createdBy: user});
    tx.create(org.collection('events').doc(`sale_${id}`), {type: 'sale.created', saleId: id, createdAt: stamp()});
    return {id, total};
  });
});
export const saleAutomation = onDocumentCreated({document: 'organizations/{orgId}/events/{eventId}', region, retry: true}, async event => {
  if (event.data?.data().type !== 'sale.created') return;
  const org = root(event.params.orgId);
  const saleId = identifier(event.data.data().saleId);
  await db.runTransaction(async tx => {
    const runRef = org.collection('automationRuns').doc(event.params.eventId);
    const [run, saleSnap, books, crm] = await Promise.all([tx.get(runRef), tx.get(org.collection('sales').doc(saleId)), tx.get(org.collection('apps').doc('accounting')), tx.get(org.collection('apps').doc('crm'))]);
    if (run.exists || !saleSnap.exists) return;
    const sale = saleSnap.data();
    if (books.data()?.expiresAt?.toMillis() > Date.now()) {
      tx.set(org.collection('invoices').doc(saleId), {saleId, contactId: sale.contactId, total: sale.total, currency: sale.currency, status: 'draft', taxStatus: 'requires_tax_configuration', createdAt: stamp()});
      // eTIMS submission is blocked until merchant tax codes and certified connector are configured.
      tx.set(org.collection('taxOutbox').doc(saleId), {invoiceId: saleId, status: 'blocked_configuration', provider: 'kra-etims', createdAt: stamp()});
    }
    if (crm.data()?.expiresAt?.toMillis() > Date.now()) tx.set(org.collection('tasks').doc(`followup_${saleId}`), {name: 'Follow up after sale', contactId: sale.contactId, saleId, status: 'open', createdAt: stamp()});
    tx.create(runRef, {status: 'completed', completedAt: stamp()});
  });
});
export const startSubscriptionPayment = callable(async request => {
  const {org, user} = await authorize(request, null, true);
  const pricing = quote(request.data.apps);
  const provider = request.data.provider;
  if (!['paystack', 'mpesa'].includes(provider)) throw new Error('Unknown payment provider');
  const reference = randomUUID();
  const payment = org.collection('payments').doc(reference);
  await payment.create({...pricing, provider, reference, user, state: 'initializing', createdAt: stamp()});
  // Server-owned index: webhook metadata never chooses an organization.
  await db.doc(`paymentReferences/${reference}`).create({orgId: org.id});
  try {
    if (provider === 'paystack') {
      const email = textValue(request.auth.token.email, 254);
      const result = await initializePaystack({secret: paystackSecret.value(), email, amount: pricing.total, reference});
      await payment.update({state: 'pending', authorizationUrl: result.authorization_url});
      return {reference, url: result.authorization_url};
    }
    const result = await initiateMpesa(JSON.parse(mpesaConfig.value()), {phone: textValue(request.data.phone), amount: pricing.total / 100, reference});
    await payment.update({state: 'pending_reconciliation', checkoutRequestId: result.CheckoutRequestID});
    return {reference, message: 'STK request sent. Complete payment on your phone, then select Check payment.'};
  } catch (error) {
    await payment.update({state: 'initialization_failed'});
    throw error;
  }
}, [paystackSecret, mpesaConfig]);
async function settleMpesa(org, reference, config) {
  const ref = org.collection('payments').doc(identifier(reference));
  const payment = (await ref.get()).data();
  if (!payment || payment.provider !== 'mpesa') throw new Error('M-Pesa payment not found');
  if (payment.state === 'paid') return {state: 'paid'};
  if (!payment.checkoutRequestId) throw new Error('Payment has not been initialized');
  // Query the provider using the server-stored STK ID; callbacks alone cannot mark paid.
  const result = await queryMpesa(config, payment.checkoutRequestId);
  if (String(result.ResultCode) !== '0') return {state: 'pending_or_failed', message: 'No successful payment verified yet. Retry after completing the phone prompt.'};
  await db.runTransaction(async tx => {
    const fresh = await tx.get(ref);
    if (fresh.data()?.state === 'paid') return;
    const appRefs = payment.apps.map(id => org.collection('apps').doc(id));
    const installed = await Promise.all(appRefs.map(r => tx.get(r)));
    installed.forEach((snap, i) => {
      const start = snap.data()?.state === 'paid' ? Math.max(Date.now(), snap.data().expiresAt.toMillis()) : Date.now();
      tx.set(appRefs[i], {appId: payment.apps[i], state: 'paid', expiresAt: Timestamp.fromMillis(start + payment.periodDays * 86400000), shares: catalog[payment.apps[i]].shares}, {merge: true});
    });
    tx.update(ref, {state: 'paid', paidAt: stamp(), verification: 'daraja-stk-query'});
  });
  return {state: 'paid'};
}
export const checkMpesaPayment = callable(async request => {
  const {org} = await authorize(request, null, true);
  return settleMpesa(org, request.data.reference, JSON.parse(mpesaConfig.value()));
}, [mpesaConfig]);
export const mpesaCallback = onRequest({region}, (req, res) => {
  if (req.method !== 'POST') { res.sendStatus(405); return; }
  // Acknowledge only. The authenticated Check payment callable queries Daraja for proof.
  res.status(200).json({ResultCode: 0, ResultDesc: 'Accepted'});
});
export const paystackWebhook = onRequest({region, secrets: [paystackSecret]}, async (req, res) => {
  if (req.method !== 'POST') { res.sendStatus(405); return; }
  if (!verifyPaystack(req.rawBody, req.get('x-paystack-signature'), paystackSecret.value())) { res.sendStatus(401); return; }
  if (req.body?.event !== 'charge.success') { res.sendStatus(200); return; }
  try {
    const reference = identifier(req.body.data.reference);
    const mapping = (await db.doc(`paymentReferences/${reference}`).get()).data();
    if (!mapping) { res.sendStatus(200); return; }
    const verified = await verifyTransaction(paystackSecret.value(), reference);
    const org = root(mapping.orgId);
    await db.runTransaction(async tx => {
      const paymentRef = org.collection('payments').doc(reference);
      const paymentSnap = await tx.get(paymentRef);
      const payment = paymentSnap.data();
      if (!payment || payment.state === 'paid') return;
      if (verified.status !== 'success' || verified.reference !== reference || verified.amount !== payment.total || verified.currency !== payment.currency || payment.provider !== 'paystack') throw new Error('Payment mismatch');
      const appRefs = payment.apps.map(app => org.collection('apps').doc(app));
      const apps = await Promise.all(appRefs.map(ref => tx.get(ref)));
      apps.forEach((snap, i) => {
        const start = snap.data()?.state === 'paid' ? Math.max(Date.now(), snap.data().expiresAt.toMillis()) : Date.now();
        tx.set(appRefs[i], {appId: payment.apps[i], state: 'paid', expiresAt: Timestamp.fromMillis(start + payment.periodDays * 86400000), shares: catalog[payment.apps[i]].shares}, {merge: true});
      });
      tx.update(paymentRef, {state: 'paid', paidAt: stamp(), providerTransactionId: String(verified.id)});
    });
    res.sendStatus(200);
  } catch { res.sendStatus(500); }
});
export const generateReport = callable(async request => {
  const {org} = await authorize(request, null, true);
  // Only aggregate commercial figures leave the tenant; no employee or patient text.
  const [sales, products, contacts] = await Promise.all([org.collection('sales').limit(500).get(), org.collection('products').limit(500).get(), org.collection('contacts').count().get()]);
  const facts = {currency: 'KES', salesCount: sales.size, salesValueMinor: sales.docs.reduce((n, d) => n + d.data().total, 0), lowStockProducts: products.docs.filter(d => d.data().stock < 5).length, contacts: contacts.data().count, boundedToFirst500: true, cashCollected: 'not calculated; sales include unpaid orders'};
  let narrative = `${facts.salesCount} sales recorded for KES ${(facts.salesValueMinor / 100).toFixed(2)}. ${facts.lowStockProducts} products have fewer than five units. Sales totals are not collected revenue.`;
  let mode = 'deterministic';
  if (request.data.useAi === true) {
    const key = geminiKey.value();
    const model = process.env.GEMINI_MODEL;
    if (!key || !model) throw new Error('Configure GEMINI_API_KEY and GEMINI_MODEL before AI reporting');
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {method: 'POST', headers: {'Content-Type': 'application/json', 'x-goog-api-key': key}, signal: AbortSignal.timeout(30000), body: JSON.stringify({contents: [{parts: [{text: `Write a short business operations report using only these JSON facts. Currency amounts are minor units. Do not invent trends, comparisons, tax advice or forecasts. Mention the 500-record limit and unpaid sales. Suggest 2 operational actions. Facts: ${JSON.stringify(facts)}`}]}]})});
    if (!response.ok) throw new Error('AI provider unavailable');
    const result = await response.json();
    narrative = result.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('') || '';
    if (!narrative) throw new Error('AI provider returned no report');
    mode = 'ai';
  }
  const report = {facts, narrative, mode};
  await org.collection('reports').add({...report, createdAt: stamp()});
  return report;
}, [geminiKey]);
