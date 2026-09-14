import {buildMasterCatalog} from './master_catalog.js';

const coreCatalog = Object.freeze({
  crm: {name: 'CRM', price: 150000, shares: ['contacts', 'tasks']},
  marketing: {name: 'Marketing Automation', price: 130000, shares: []},
  bookings: {name: 'Bookings & Scheduling', price: 110000, shares: []},
  ecommerce: {name: 'E-Commerce Storefront', price: 170000, shares: []},
  social: {name: 'Social Media Management', price: 120000, shares: []},
  livechat: {name: 'Live Chat & AI Bot', price: 115000, shares: []},
  events: {name: 'Event Management', price: 140000, shares: []},
  surveys: {name: 'Forms & Customer Surveys', price: 95000, shares: []},
  pos: {name: 'Point of sale', price: 180000, shares: ['contacts', 'products', 'sales'], requires: ['inventory']},
  inventory: {name: 'Inventory', price: 120000, shares: ['products']},
  procurement: {name: 'Procurement & Purchasing', price: 140000, shares: []},
  manufacturing: {name: 'Manufacturing & MRP', price: 220000, shares: []},
  wms: {name: 'Barcode WMS & Picking', price: 155000, shares: []},
  quality: {name: 'Quality Control', price: 125000, shares: []},
  fieldservice: {name: 'Field Service Management', price: 150000, shares: []},
  fleet: {name: 'Fleet & Vehicle Logistics', price: 160000, shares: []},
  accounting: {name: 'Books', price: 220000, shares: ['sales', 'invoices']},
  expenses: {name: 'Expense Management', price: 110000, shares: []},
  subscriptions: {name: 'Subscription Billing', price: 145000, shares: []},
  assets: {name: 'Fixed Asset Register', price: 130000, shares: []},
  payments: {name: 'M-Pesa & Paystack Hub', price: 90000, shares: ['payments']},
  etims: {name: 'Kenya KRA eTIMS', price: 100000, shares: ['etims_logs']},
  hr: {name: 'People', price: 200000, shares: ['employees']},
  payroll: {name: 'Statutory Payroll Hub', price: 210000, shares: []},
  recruitment: {name: 'Recruitment & ATS', price: 135000, shares: []},
  lms: {name: 'Learning & Staff LMS', price: 110000, shares: []},
  projects: {name: 'Projects & Work', price: 160000, shares: ['projects']},
  helpdesk: {name: 'Customer Desk', price: 140000, shares: ['tickets']},
  documents: {name: 'WorkDrive & Digital Signatures', price: 100000, shares: []},
  knowledge: {name: 'Knowledge Base & SOPs', price: 85000, shares: []},
  contracts: {name: 'Contracts Management', price: 125000, shares: []},
  discussions: {name: 'Team Chat & Channels', price: 90000, shares: []},
  analytics: {name: 'Analytics & BI Hub', price: 175000, shares: []},
  vault: {name: 'Secret Vault & Passwords', price: 80000, shares: []},
  desk_phone: {name: 'Cloud PBX & Call Center', price: 150000, shares: []},
  property: {name: 'Property & Real Estate', price: 250000, shares: []},
  sacco: {name: 'SACCO & Cooperative Hub', price: 300000, shares: []},
  hotel: {name: 'Hotel & Hospitality', price: 280000, shares: []},
  restaurant: {name: 'Restaurant & Bar POS', price: 190000, shares: []},
  ngo: {name: 'NGO & Grants Management', price: 220000, shares: []},
  hospital: {name: 'Hospital', price: 450000, shares: ['patients']},
  school: {name: 'Schools', price: 350000, shares: ['students']},
  agri: {name: 'Agriculture & Outgrowers', price: 240000, shares: []},
  freight: {name: 'Cargo Freight & Customs', price: 290000, shares: []},
  legal: {name: 'Legal Practice & Cases', price: 210000, shares: []},
  microfinance: {name: 'Microfinance & Credit Scoring', price: 320000, shares: []},
  attendance: {name: 'Attendance', price: 80000, shares: []},
  time: {name: 'Time tracking', price: 60000, shares: []}
});

export const catalog = Object.freeze({
  ...coreCatalog,
  ...buildMasterCatalog(coreCatalog)
});

export function identifier(value) {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(value)) throw new Error('Invalid identifier');
  return value;
}
export function textValue(value, max = 200) {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw new Error('Invalid text');
  return value.trim();
}
export function optionalText(value, max = 2000) {
  if (value == null || value === '') return '';
  if (typeof value !== 'string' || value.length > max) throw new Error('Invalid text');
  return value.trim();
}
export function money(value) {
  if (!Number.isSafeInteger(value) || value < 0 || value > 1000000000) throw new Error('Invalid amount in minor units');
  return value;
}
export function expandRequiredApps(apps) {
  if (!Array.isArray(apps)) throw new Error('Choose apps');
  const result = new Set();
  const visit = id => {
    if (!Object.hasOwn(catalog, id)) throw new Error('Unknown app');
    if (result.has(id)) return;
    result.add(id);
    for (const dependency of catalog[id].requires || []) visit(dependency);
  };
  apps.forEach(visit);
  return [...result].sort();
}
export function quote(apps) {
  if (!Array.isArray(apps) || !apps.length) throw new Error('Choose apps');
  const unique = expandRequiredApps(apps);
  const subtotal = unique.reduce((sum, id) => sum + catalog[id].price, 0);
  const discountPercent = unique.length >= 6 ? 20 : unique.length >= 3 ? 10 : 0;
  return {apps: unique, currency: 'KES', subtotal, discountPercent, total: Math.round(subtotal * (100 - discountPercent) / 100), periodDays: 30};
}
export function canAccess(member, app, installation, now = Date.now()) {
  return !!member && (member.role === 'owner' || member.apps?.includes(app)) && installation?.expiresAt?.toMillis() > now;
}
export function saleTotal(product, quantity) {
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 10000) throw new Error('Invalid quantity');
  if (!Number.isInteger(product.stock) || product.stock < quantity) throw new Error('Insufficient stock');
  return money(money(product.price) * quantity);
}
export function sanitizeRecord(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Invalid record');
  const entries = Object.entries(input);
  if (!entries.length || entries.length > 40) throw new Error('Invalid record');
  const result = {};
  for (const [key, value] of entries) {
    const safeKey = identifier(key);
    if (value == null) { result[safeKey] = null; continue; }
    if (typeof value === 'string') { result[safeKey] = optionalText(value, 4000); continue; }
    if (typeof value === 'boolean') { result[safeKey] = value; continue; }
    if (typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= 1000000000000) { result[safeKey] = value; continue; }
    throw new Error(`Unsupported record field: ${safeKey}`);
  }
  if (!result.name && result.title) result.name = result.title;
  if (!result.name) throw new Error('Record requires name or title');
  return result;
}
