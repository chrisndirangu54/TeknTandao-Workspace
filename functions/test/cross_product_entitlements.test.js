'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {normalizedSubscription,eventEnvelope,serviceProducts}=require('../src/cross_product_entitlements');
test('retains canonical customer identity',()=>{
 const x=normalizedSubscription({customerId:'uid1',product:'TV',status:'active'},'sub1');
 assert.equal(x.customerId,'uid1');assert.equal(x.subscriptionId,'sub1');
});
test('rejects product spoofing',()=>assert.throws(()=>normalizedSubscription({customerId:'uid1',product:'ROUTER'},'s')));
test('creates minimal idempotent event',()=>{
 const x=eventEnvelope({eventId:'evt1',customerId:'u',subscriptionId:'s',product:'ISP',status:'active',occurredAt:'2026-10-24T00:00:00Z'});
 assert.equal(x.type,'subscription.status.changed.v1');
 assert.equal('routerPassword' in x,false);
});

test('single bundle expands into two service entitlements', () => {
  const bundle = normalizedSubscription({customerId:'uid1',product:'ISP_TV_BUNDLE',status:'active'},'bundle1');
  assert.deepEqual(serviceProducts(bundle.product),['ISP','TV']);
  assert.deepEqual(serviceProducts('WORKSPACE'),['WORKSPACE']);
});
