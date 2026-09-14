const definitions = Object.freeze({
  contacts: {type: 'customer', sourceApp: 'crm', labels: ['name', 'email', 'phone'], attributes: ['email', 'phone', 'status']},
  products: {type: 'product', sourceApp: 'inventory', labels: ['name', 'sku'], attributes: ['sku', 'stock', 'price', 'status']},
  employees: {type: 'employee', sourceApp: 'hr', labels: ['name', 'employee', 'email'], attributes: ['email', 'department', 'role', 'status']},
  projects: {type: 'project', sourceApp: 'projects', labels: ['name', 'title'], attributes: ['owner', 'status', 'priority']},
  tickets: {type: 'task', sourceApp: 'helpdesk', labels: ['name', 'title'], attributes: ['customer', 'priority', 'status']},
  properties: {type: 'property', sourceApp: 'property', labels: ['name', 'property'], attributes: ['tenant', 'status', 'rentKes']},
  sacco_members: {type: 'member', sourceApp: 'sacco', labels: ['name', 'member'], attributes: ['status', 'sharesKes', 'activeLoanKes']},
  ecommerce_orders: {type: 'order', sourceApp: 'ecommerce', labels: ['name', 'title', 'customer'], attributes: ['customer', 'total', 'status', 'paymentMethod']},
  procurement_pos: {type: 'order', sourceApp: 'procurement', labels: ['name', 'title', 'vendor'], attributes: ['vendor', 'item', 'qty', 'quantity', 'status']},
  work_orders: {type: 'order', sourceApp: 'manufacturing', labels: ['name', 'title', 'product'], attributes: ['product', 'quantity', 'status']},
  fleet_trips: {type: 'shipment', sourceApp: 'fleet', labels: ['name', 'title', 'rego'], attributes: ['rego', 'origin', 'destination', 'status']},
  grants: {type: 'project', sourceApp: 'ngo', labels: ['name', 'title'], attributes: ['donor', 'amount', 'status']},
  sales: {type: 'order', sourceApp: 'pos', labels: ['name', 'customer', 'id'], attributes: ['contactId', 'productId', 'quantity', 'total', 'paymentState']},
  invoices: {type: 'invoice', sourceApp: 'accounting', labels: ['name', 'customer', 'id'], attributes: ['saleId', 'contactId', 'total', 'status', 'taxStatus']},
  payments: {type: 'payment', sourceApp: 'payments', labels: ['reference', 'name', 'id'], attributes: ['provider', 'state', 'total', 'currency']},
  tasks: {type: 'task', sourceApp: 'crm', labels: ['name', 'title'], attributes: ['contactId', 'saleId', 'status']}
});

function scalar(value) {
  return value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';
}

function labelFor(definition, id, data) {
  for (const key of definition.labels) {
    const value = key === 'id' ? id : data?.[key];
    if (value != null && String(value).trim()) return String(value).trim().slice(0, 240);
  }
  return id;
}

export function projectGraphNode(collectionId, docId, data) {
  const definition = definitions[collectionId];
  if (!definition || !data || typeof data !== 'object') return null;
  const attributes = {};
  for (const key of definition.attributes) {
    const value = data[key];
    if (scalar(value)) attributes[key] = value;
  }
  return {
    type: definition.type,
    entityId: docId,
    label: labelFor(definition, docId, data),
    sourceApp: definition.sourceApp,
    attributes
  };
}

export function projectedGraphEdges(collectionId, docId, data) {
  if (!data || typeof data !== 'object') return [];
  const edges = [];
  const push = (from, to, relation, sourceApp) => {
    if (typeof from !== 'string' || typeof to !== 'string' || !from || !to) return;
    edges.push({from, to, relation, sourceApp, attributes: {projected: true}});
  };
  if (collectionId === 'sales') {
    if (data.contactId) push(`order_${docId}`, `customer_${data.contactId}`, 'customer', 'pos');
    if (data.productId) push(`order_${docId}`, `product_${data.productId}`, 'contains', 'pos');
  } else if (collectionId === 'invoices') {
    if (data.contactId) push(`invoice_${docId}`, `customer_${data.contactId}`, 'billed_to', 'accounting');
    if (data.saleId) push(`invoice_${docId}`, `order_${data.saleId}`, 'generated_from', 'accounting');
  } else if (collectionId === 'tasks') {
    if (data.contactId) push(`task_${docId}`, `customer_${data.contactId}`, 'about_customer', 'crm');
    if (data.saleId) push(`task_${docId}`, `order_${data.saleId}`, 'about_order', 'crm');
  }
  return edges;
}

export function supportedProjectionCollections() {
  return Object.keys(definitions);
}
