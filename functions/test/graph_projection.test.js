import test from 'node:test';
import assert from 'node:assert/strict';
import {projectGraphNode, projectedGraphEdges, supportedProjectionCollections} from '../src/graph_projection_domain.js';

test('core business records project into stable graph nodes', () => {
  const customer = projectGraphNode('contacts', 'customer_1', {name:'Acme Ltd',email:'ops@acme.test',phone:'254700000000'});
  assert.deepEqual(customer, {
    type:'customer',
    entityId:'customer_1',
    label:'Acme Ltd',
    sourceApp:'crm',
    attributes:{email:'ops@acme.test',phone:'254700000000'}
  });
  const product = projectGraphNode('products', 'sku_1', {name:'Tea',sku:'TEA-1',stock:4,price:12000});
  assert.equal(product.type, 'product');
  assert.equal(product.attributes.stock, 4);
  assert.equal(projectGraphNode('patient_records', 'p1', {name:'Private'}), null);
});

test('transactional references create deterministic cross-app graph relationships', () => {
  const saleEdges = projectedGraphEdges('sales', 'sale_1', {contactId:'customer_1',productId:'sku_1'});
  assert.deepEqual(saleEdges.map(edge => [edge.from, edge.to, edge.relation]), [
    ['order_sale_1','customer_customer_1','customer'],
    ['order_sale_1','product_sku_1','contains']
  ]);
  const invoiceEdges = projectedGraphEdges('invoices', 'invoice_1', {contactId:'customer_1',saleId:'sale_1'});
  assert.equal(invoiceEdges.length, 2);
  assert.equal(invoiceEdges[1].relation, 'generated_from');
});

test('projection allow-list remains bounded to known business collections', () => {
  const collections = supportedProjectionCollections();
  assert.ok(collections.includes('contacts'));
  assert.ok(collections.includes('sales'));
  assert.ok(collections.includes('payments'));
  assert.ok(!collections.includes('businessGraphNodes'));
  assert.ok(!collections.includes('agentAudit'));
});
