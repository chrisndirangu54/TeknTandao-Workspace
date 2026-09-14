import test from 'node:test';
import assert from 'node:assert/strict';
import {createBlankWebsiteDocument} from '../src/website_builder_domain.js';
import {
  businessProductCmsSchema,
  normalizeProductRecord,
  publicProductValues,
  summarizeBusinessGraph,
  validateProductMutation,
  validateWebsiteBusinessPlan,
} from '../src/website_business_ai_domain.js';

test('AI products use validated inventory fields and KES minor units', () => {
  const product = normalizeProductRecord({
    name: 'Premium Coffee', sku: 'COF-1', description: 'Single origin', category: 'Coffee',
    unit: '1 kg', price: 125000, stock: 40, reorderLevel: 8, active: true,
    featured: true, websiteVisible: true, imageUrl: 'https://example.com/coffee.webp'
  });
  assert.equal(product.price, 125000);
  assert.equal(product.stock, 40);
  assert.equal(product.featured, true);
  assert.throws(() => normalizeProductRecord({name: 'Bad', price: -1, stock: 1}));
  assert.throws(() => normalizeProductRecord({name: 'Bad', price: 100, stock: 1, secret: 'x'}));
});

test('product mutations distinguish create from sparse update', () => {
  const create = validateProductMutation({
    mutationId: 'new_coffee', operation: 'create', productId: 'coffee',
    product: {name: 'Coffee', price: 50000, stock: 10}
  });
  assert.equal(create.operation, 'create');
  const update = validateProductMutation({
    mutationId: 'feature_coffee', operation: 'update', productId: 'coffee',
    product: {featured: true, stock: 9}
  });
  assert.deepEqual(update.product, {stock: 9, featured: true});
  assert.throws(() => validateProductMutation({operation: 'update', product: {stock: 3}}));
});

test('business products expose only the system CMS contract', () => {
  assert.equal(businessProductCmsSchema.collectionId, 'business_products');
  assert.equal(businessProductCmsSchema.publicRead, true);
  const values = publicProductValues('tea', {name: 'Tea', price: 12000, stock: 3, reorderLevel: 1});
  assert.equal(values.productId, 'tea');
  assert.equal(values.price, 12000);
  assert.equal(values.websiteVisible, true);
});

test('Business Graph summary gives AI aggregate context without raw entities', () => {
  const summary = summarizeBusinessGraph([
    {type: 'product', sourceApp: 'inventory'},
    {type: 'product', sourceApp: 'inventory'},
    {type: 'customer', sourceApp: 'crm'},
  ], [
    {relation: 'purchased'},
    {relation: 'purchased'},
  ]);
  assert.equal(summary.byType.product, 2);
  assert.equal(summary.byType.customer, 1);
  assert.equal(summary.relations.purchased, 2);
});

test('website business plan validates document and bounded product changes', () => {
  const plan = validateWebsiteBusinessPlan({
    summary: 'Merchandise the store',
    rationale: ['Inventory is available'],
    document: createBlankWebsiteDocument('Store'),
    productChanges: [{
      mutationId: 'feature_tea', operation: 'update', productId: 'tea',
      product: {featured: true}, reason: 'Feature an existing item'
    }],
    publishRecommended: true,
  });
  assert.equal(plan.document.title, 'Store');
  assert.equal(plan.productChanges[0].product.featured, true);
  assert.equal(plan.publishRecommended, true);
});
