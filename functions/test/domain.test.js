import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {catalog, quote, canAccess, saleTotal, identifier, sanitizeRecord} from '../src/domain.js';
import {masterCatalogueCategoryCount, masterCatalogueSourceAppCount} from '../src/master_catalog.js';
import {verifyPaystack} from '../src/providers.js';

test('bundle quote uses distinct apps, minor units, and correct tiers', () => {
  assert.equal(quote(['crm', 'crm']).total, 150000);
  assert.deepEqual(quote(['crm', 'pos', 'inventory']), {
    apps: ['crm', 'inventory', 'pos'],
    currency: 'KES',
    subtotal: 450000,
    discountPercent: 10,
    total: 405000,
    periodDays: 30
  });
  assert.equal(quote(['crm', 'pos', 'inventory', 'hr', 'school', 'hospital']).discountPercent, 20);
  assert.throws(() => quote(['__proto__']));
  assert.throws(() => quote([]));
});

test('master catalogue is available to install and price', () => {
  assert.equal(masterCatalogueCategoryCount, 30);
  assert.equal(masterCatalogueSourceAppCount, 653);
  assert.ok(Object.keys(catalog).length > 665);
  assert.equal(catalog.mc25_mining_operations.name, 'Mining Operations');
  assert.equal(catalog.mc30_ai_finance_analyst.name, 'AI Finance Analyst');
  assert.equal(catalog.mc22_airtel_money.category, 'Africa-First Payments & Compliance');
  assert.equal(catalog.mc30_agent_control_center.name, 'Agent Control Center');
  assert.equal(catalog.mc11_business_graph.name, 'Business Graph');
  assert.equal(catalog.mc19_cross_border_trade_os.name, 'Cross-Border Trade OS');
  assert.equal(catalog.mc13_iot_and_device_cloud.name, 'IoT & Device Cloud');
  assert.equal(catalog.mc25_geo_and_mining_intelligence.name, 'Geo & Mining Intelligence');
  assert.equal(quote(['mc25_mining_operations']).subtotal, catalog.mc25_mining_operations.price);
  assert.equal(
    quote(['mc30_agent_control_center', 'mc11_business_graph', 'mc19_cross_border_trade_os']).discountPercent,
    10
  );
});

test('generic and specialized records preserve validated scalar fields', () => {
  assert.deepEqual(sanitizeRecord({title: 'Campaign A', segment: 'SMEs', status: 'ACTIVE'}), {
    title: 'Campaign A',
    segment: 'SMEs',
    status: 'ACTIVE',
    name: 'Campaign A'
  });
  assert.deepEqual(sanitizeRecord({vendor: 'Acme Supplies', item: 'Cement', qty: 40}), {
    vendor: 'Acme Supplies',
    item: 'Cement',
    qty: 40,
    name: 'Acme Supplies'
  });
  assert.deepEqual(sanitizeRecord({site: 'Kendege', task: 'Sample trench', status: 'ACTIVE'}), {
    site: 'Kendege',
    task: 'Sample trench',
    status: 'ACTIVE',
    name: 'Kendege'
  });
  assert.throws(() => sanitizeRecord({payload: {nested: true}}));
});

test('access requires membership, app permission, and an unexpired entitlement', () => {
  const active = {expiresAt: {toMillis: () => 2000}};
  assert.equal(canAccess(null, 'crm', active, 1000), false);
  assert.equal(canAccess({role: 'member', apps: ['pos']}, 'hospital', active, 1000), false);
  assert.equal(canAccess({role: 'owner'}, 'crm', active, 2000), false);
  assert.equal(canAccess({role: 'owner'}, 'crm', active, 1000), true);
});

test('stock and money cannot go negative or accept fractional quantity', () => {
  assert.equal(saleTotal({price: 15000, stock: 2}, 2), 30000);
  for (const qty of [-1, 0, 1.5, 3]) assert.throws(() => saleTotal({price: 15000, stock: 2}, qty));
  assert.throws(() => saleTotal({price: -100, stock: 2}, 1));
  assert.throws(() => identifier('../other-tenant'));
});

test('Paystack authenticates original bytes and rejects malformed or modified payloads', () => {
  const payload = Buffer.from('{"event":"charge.success"}');
  const signature = createHmac('sha512', 'test-secret').update(payload).digest('hex');
  assert.equal(verifyPaystack(payload, signature, 'test-secret'), true);
  assert.equal(verifyPaystack(Buffer.from('{}'), signature, 'test-secret'), false);
  for (const bad of [undefined, '', 'zz'.repeat(64), signature.slice(1)]) {
    assert.equal(verifyPaystack(payload, bad, 'test-secret'), false);
  }
});
