export const catalog = Object.freeze({
  crm: {name: 'CRM', price: 150000, shares: ['contacts', 'tasks']},
  hr: {name: 'People', price: 200000, shares: []},
  pos: {name: 'Point of sale', price: 180000, shares: ['contacts', 'products', 'sales']},
  inventory: {name: 'Inventory', price: 120000, shares: ['products']},
  hospital: {name: 'Hospital', price: 450000, shares: []},
  school: {name: 'Schools', price: 350000, shares: []},
  accounting: {name: 'Books', price: 220000, shares: ['sales', 'invoices']},
  attendance: {name: 'Attendance', price: 80000, shares: []},
  time: {name: 'Time tracking', price: 60000, shares: []}
});
export function identifier(value) {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(value)) throw new Error('Invalid identifier');
  return value;
}
export function textValue(value, max = 200) {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw new Error('Invalid text');
  return value.trim();
}
export function money(value) {
  if (!Number.isSafeInteger(value) || value < 0 || value > 1000000000) throw new Error('Invalid amount in minor units');
  return value;
}
export function quote(apps) {
  if (!Array.isArray(apps) || !apps.length || apps.length > Object.keys(catalog).length) throw new Error('Choose apps');
  const unique = [...new Set(apps)].sort();
  if (unique.some(a => !Object.hasOwn(catalog, a))) throw new Error('Unknown app');
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
