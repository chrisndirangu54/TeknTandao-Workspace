import {test, after} from 'node:test';
import assert from 'node:assert/strict';
import {getFirestore, Timestamp} from 'firebase-admin/firestore';
import {getApps, deleteApp} from 'firebase-admin/app';
if (!process.env.FIRESTORE_EMULATOR_HOST || process.env.GCLOUD_PROJECT !== 'demo-tandao') throw new Error('Use the demo-tandao Firestore emulator');
const api = await import('../src/reseller.js');
const db = getFirestore();
const prefix = `reseller_${Date.now()}`;
const seller = db.doc(`organizations/${prefix}_seller`), client = db.doc(`organizations/${prefix}_client`);
const req = (org, data = {}, uid = 'owner') => ({auth: {uid, token: {email: 'test@example.com'}}, data: {orgId: org.id, ...data}});
const policy = {currency: 'KES', monthlyProfit: {fixedMinor: 10000, markupBps: 2000}, generationProfit: {fixedMinor: 2000, markupBps: 1000}, tokenRates: {model: 'test', inputPerMillionMinor: 10000, outputPerMillionMinor: 30000, cachedInputPerMillionMinor: 1000}, usdToKes: 130};

test('reseller offer, cost allocation, client checkout, verified settlement and renewal are tenant scoped and idempotent', async () => {
  for (const org of [seller, client]) {
    await org.set({name: org.id}); await org.collection('members').doc('owner').set({role: 'owner'});
  }
  await assert.rejects(api.saveResellerPricing.run(req(seller, {policy})), /approved/);
  await assert.rejects(api.setResellerAccount.run(req(seller, {workspaceId: seller.id, enabled: true})), /administrator/);
  await api.setResellerAccount.run({auth: {uid: 'admin', token: {platformAdmin: true}}, data: {workspaceId: seller.id, enabled: true}});
  await api.saveResellerPricing.run(req(seller, {policy}));
  const site = await api.installVettedSiteTemplate.run(req(seller, {presetId: 'clinic'}));
  const template = await api.saveVettedSiteTemplate.run(req(seller, {projectId: site.projectId, name: 'Reusable clinic'}));
  assert.ok((await api.installVettedSiteTemplate.run(req(seller, {templateId: template.id}))).projectId);
  assert.ok((await api.exportVettedSite.run(req(seller, {projectId: site.projectId}))).files['index.html']);
  await assert.rejects(api.exportVettedSite.run(req(client, {projectId: site.projectId})));
  await assert.rejects(api.getResellerStudio.run(req(seller, {}, 'outsider')), /owner/);
  const offered = await api.createResellerBundle.run(req(seller, {bundle: {name: 'Client website', clientWorkspaceId: client.id, projectId: site.projectId, apps: ['crm']}}));
  const bundleRef = db.doc(`resellerBundles/${offered.id}`);
  const period = '2026-10';
  await assert.rejects(api.createResellerInvoice.run(req(seller, {bundleId: offered.id, period})), /cost/);
  await api.recordResellerFirebaseCost.run(req(seller, {cost: {clientWorkspaceId: client.id, period, amountMinor: 50000, source: 'Billing export allocation fixture', estimated: false}}));
  const invoices = await Promise.all([0, 1].map(() => api.createResellerInvoice.run(req(seller, {bundleId: offered.id, period}))));
  assert.equal(invoices[0].id, invoices[1].id);
  const invoice = invoices[0];
  assert.equal(invoice.totalMinor, 70000);
  await assert.rejects(api.startResellerInvoicePayment.run(req(seller, {invoiceId: invoice.id})), /invoice/);
  const original = globalThis.fetch;
  let initialized = 0;
  globalThis.fetch = async (url, options) => {
    if (url !== 'https://api.paystack.co/transaction/initialize') return original(url, options);
    initialized++;
    return new Response(JSON.stringify({status: true, data: {authorization_url: 'https://checkout.paystack.com/test'}}));
  };
  process.env.PAYSTACK_SECRET_KEY = 'test-only';
  let checkout;
  try {
    checkout = await api.startResellerInvoicePayment.run(req(client, {invoiceId: invoice.id}));
    assert.equal((await api.startResellerInvoicePayment.run(req(client, {invoiceId: invoice.id}))).reference, checkout.reference);
    assert.equal(initialized, 1);
  } finally { globalThis.fetch = original; }
  const verified = {id: 123, status: 'success', reference: checkout.reference, amount: invoice.totalMinor, currency: 'KES'};
  await assert.rejects(api.settleResellerPayment(checkout.reference, {...verified, amount: 1}), /mismatch/);
  assert.equal((await client.collection('apps').doc('crm').get()).exists, false);
  await Promise.all([0, 1].map(() => api.settleResellerPayment(checkout.reference, verified)));
  const bundle = (await bundleRef.get()).data();
  assert.equal(bundle.status, 'active');
  const paidThrough = bundle.paidThrough.toMillis();
  await api.settleResellerPayment(checkout.reference, verified);
  assert.equal((await bundleRef.get()).data().paidThrough.toMillis(), paidThrough);
  assert.equal((await client.collection('apps').doc('crm').get()).data().state, 'paid');
  const publicRef = db.doc(`publishedWebsiteSites/${bundle.publicId}`);
  assert.equal((await publicRef.get()).data().document.title, 'Clinic and care');
  assert.equal((await seller.collection('resellerEarnings').get()).size, 1);
  // Domain money cannot be spent using an unrelated paid subscription invoice.
  await bundleRef.update({domainQuote: {domain: 'example.com', costMinor: 9999}, domainStatus: 'awaiting_payment'});
  await assert.rejects(api.registerResellerDomain.run(req(seller, {bundleId: offered.id, confirmPurchase: true})), /domain invoice/);
  await bundleRef.update({paidThrough: Timestamp.fromMillis(0)});
  await api.maintainResellerSubscriptions.run({});
  assert.equal((await publicRef.get()).exists, false);
  assert.ok((await bundleRef.get()).data().suspendedPublication);
  await api.cancelResellerBundle.run(req(client, {bundleId: offered.id}));
  await assert.rejects(api.createResellerInvoice.run(req(seller, {bundleId: offered.id, period: '2026-11'})), /available/);
});

after(async () => { await Promise.all(getApps().map(app => deleteApp(app))); });
