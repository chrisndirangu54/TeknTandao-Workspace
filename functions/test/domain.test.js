import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {quote, canAccess, saleTotal, identifier} from '../src/domain.js';
import {verifyPaystack} from '../src/providers.js';
test('bundle quote uses distinct apps, minor units, and correct tiers', () => {
  assert.equal(quote(['crm', 'crm']).total, 150000);
  assert.deepEqual(quote(['crm', 'pos', 'inventory']), {apps: ['crm','inventory','pos'],currency:'KES',subtotal:450000,discountPercent:10,total:405000,periodDays:30});
  assert.equal(quote(['crm', 'pos', 'inventory', 'hr', 'school', 'hospital']).discountPercent, 20);
  assert.throws(() => quote(['__proto__']));
  assert.throws(() => quote([]));
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
  for (const bad of [undefined, '', 'zz'.repeat(64), signature.slice(1)]) assert.equal(verifyPaystack(payload, bad, 'test-secret'), false);
});
