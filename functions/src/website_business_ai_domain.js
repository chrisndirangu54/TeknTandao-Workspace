import {createHash} from 'node:crypto';
import {identifier, money, optionalText, textValue} from './domain.js';
import {validateWebsiteDocument} from './website_builder_domain.js';

export const websiteBusinessAgentId = 'website_operator';
export const websiteBuilderAppId = 'mc14_website_builder';
export const businessProductCollectionId = 'business_products';

function bool(value, fallback) {
  return typeof value === 'boolean' ? value : fallback;
}

function safeHttpsUrl(value) {
  if (value == null || value === '') return '';
  const raw = textValue(value, 2000);
  let parsed;
  try { parsed = new URL(raw); } catch { throw new Error('Invalid product image URL'); }
  if (parsed.protocol !== 'https:') throw new Error('Product image URL must use HTTPS');
  parsed.hash = '';
  return parsed.toString();
}

function optionalInteger(value, label, {min = 0, max = 10000000} = {}) {
  if (value == null) return undefined;
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new Error(`Invalid ${label}`);
  return value;
}

export function normalizeProductRecord(input, {partial = false} = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Invalid product');
  const result = {};
  const has = key => Object.prototype.hasOwnProperty.call(input, key);

  if (!partial || has('name')) {
    if (!partial && !String(input.name || '').trim()) throw new Error('Product name is required');
    if (has('name')) result.name = textValue(input.name, 240);
  }
  if (has('sku')) result.sku = optionalText(input.sku, 120);
  if (has('description')) result.description = optionalText(input.description, 4000);
  if (has('category')) result.category = optionalText(input.category, 160);
  if (has('unit')) result.unit = optionalText(input.unit, 80);
  if (has('imageUrl')) result.imageUrl = safeHttpsUrl(input.imageUrl);
  if (has('price')) result.price = money(input.price);
  if (has('stock')) result.stock = optionalInteger(input.stock, 'stock');
  if (has('reorderLevel')) result.reorderLevel = optionalInteger(input.reorderLevel, 'reorder level');
  if (has('active')) result.active = bool(input.active, true);
  if (has('featured')) result.featured = bool(input.featured, false);
  if (has('websiteVisible')) result.websiteVisible = bool(input.websiteVisible, true);
  if (has('seoTitle')) result.seoTitle = optionalText(input.seoTitle, 180);
  if (has('seoDescription')) result.seoDescription = optionalText(input.seoDescription, 500);

  const recognized = new Set([
    'name','sku','description','category','unit','imageUrl','price','stock','reorderLevel',
    'active','featured','websiteVisible','seoTitle','seoDescription'
  ]);
  const extras = Object.keys(input).filter(key => !recognized.has(key));
  if (extras.length) throw new Error(`Unsupported product fields: ${extras.join(', ')}`);
  if (partial && Object.keys(result).length === 0) throw new Error('Product update is empty');
  return result;
}

export function validateProductMutation(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Invalid product mutation');
  const operation = String(input.operation || '').toLowerCase();
  if (!['create', 'update'].includes(operation)) throw new Error('Invalid product operation');
  const productId = input.productId ? identifier(input.productId) : null;
  if (operation === 'update' && !productId) throw new Error('Product update requires productId');
  return {
    mutationId: identifier(input.mutationId || `product_${createHash('sha256').update(JSON.stringify(input)).digest('hex').slice(0, 20)}`),
    operation,
    productId,
    product: normalizeProductRecord(input.product || input.changes, {partial: operation === 'update'}),
    reason: optionalText(input.reason || '', 600),
  };
}

export function publicProductValues(productId, raw = {}) {
  const clean = normalizeProductRecord({
    name: raw.name || productId,
    sku: raw.sku || '',
    description: raw.description || '',
    category: raw.category || '',
    unit: raw.unit || '',
    imageUrl: raw.imageUrl || '',
    price: Number.isSafeInteger(raw.price) ? raw.price : 0,
    stock: Number.isSafeInteger(raw.stock) ? raw.stock : 0,
    reorderLevel: Number.isSafeInteger(raw.reorderLevel) ? raw.reorderLevel : 0,
    active: raw.active !== false,
    featured: raw.featured === true,
    websiteVisible: raw.websiteVisible !== false,
    seoTitle: raw.seoTitle || '',
    seoDescription: raw.seoDescription || '',
  });
  return {productId, ...clean};
}

export const businessProductCmsSchema = Object.freeze({
  collectionId: businessProductCollectionId,
  name: 'Business products',
  publicRead: true,
  maxPublicItems: 100,
  defaultSort: 'name',
  fields: [
    {id:'productId', label:'Product ID', type:'text', required:true, public:true},
    {id:'name', label:'Name', type:'text', required:true, public:true},
    {id:'sku', label:'SKU', type:'text', required:false, public:true},
    {id:'description', label:'Description', type:'longText', required:false, public:true},
    {id:'category', label:'Category', type:'text', required:false, public:true},
    {id:'unit', label:'Unit', type:'text', required:false, public:true},
    {id:'imageUrl', label:'Image', type:'image', required:false, public:true},
    {id:'price', label:'Price minor units', type:'number', required:true, public:true},
    {id:'stock', label:'Stock', type:'number', required:true, public:true},
    {id:'reorderLevel', label:'Reorder level', type:'number', required:false, public:false},
    {id:'active', label:'Active', type:'boolean', required:true, public:true},
    {id:'featured', label:'Featured', type:'boolean', required:true, public:true},
    {id:'websiteVisible', label:'Website visible', type:'boolean', required:true, public:false},
    {id:'seoTitle', label:'SEO title', type:'text', required:false, public:true},
    {id:'seoDescription', label:'SEO description', type:'longText', required:false, public:true},
  ]
});

export function summarizeBusinessGraph(nodes = [], edges = []) {
  const byType = {};
  const bySourceApp = {};
  for (const node of nodes) {
    const type = String(node.type || 'unknown');
    const source = String(node.sourceApp || 'unknown');
    byType[type] = (byType[type] || 0) + 1;
    bySourceApp[source] = (bySourceApp[source] || 0) + 1;
  }
  const relations = {};
  for (const edge of edges) {
    const relation = String(edge.relation || 'related');
    relations[relation] = (relations[relation] || 0) + 1;
  }
  return {nodes: nodes.length, edges: edges.length, byType, bySourceApp, relations};
}

export function validateWebsiteBusinessPlan(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Invalid website business plan');
  const rationaleInput = Array.isArray(input.rationale) ? input.rationale : [];
  const productInput = Array.isArray(input.productChanges) ? input.productChanges : [];
  if (productInput.length > 25) throw new Error('AI plan contains too many product changes');
  return {
    summary: textValue(input.summary || 'AI website business plan', 600),
    rationale: rationaleInput.slice(0, 12).map(item => textValue(String(item), 500)),
    document: validateWebsiteDocument(input.document),
    productChanges: productInput.map(validateProductMutation),
    publishRecommended: input.publishRecommended === true,
    optimizationGoal: optionalText(input.optimizationGoal || '', 300),
  };
}

export function businessContextDigest(context) {
  return createHash('sha256').update(JSON.stringify(context)).digest('hex');
}
