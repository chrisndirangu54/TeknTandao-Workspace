// Pure, tenant-scoped settlement matching. All amounts are integer minor units.
// This module does not move money or mark a payment as paid.
function id(value, label) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_.:-]{1,128}$/.test(value)) {
    throw new Error(`Invalid ${label}`);
  }
  return value;
}
function amount(value) {
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error('Amount must be a positive integer of minor currency units');
  return value;
}
function normalize(item, type, orgId, currency) {
  if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error(`Invalid ${type}`);
  if (id(item.orgId, 'organization') !== orgId) throw new Error('Cross-tenant settlement record');
  if (item.currency !== currency) throw new Error('Currency mismatch');
  const provider = id(item.provider, 'provider');
  const reference = id(item.reference, 'reference');
  return {id: id(item.id, 'record id'), orgId, provider, reference,
    amountMinor: amount(item.amountMinor), currency};
}
const key = item => `${item.provider}\u0000${item.reference}`;

/**
 * Deterministic one-to-one matching for verified external statements and internal
 * payment records. Never post journals automatically from an unverified statement.
 *
 * @param {{orgId:string,currency:string,payments:Array,settlements:Array}} input
 * @returns {{matched:Array,exceptions:Array,summary:Object}}
 */
export function reconcileSettlements(input) {
  if (!input || typeof input !== 'object') throw new Error('Invalid reconciliation input');
  const orgId = id(input.orgId, 'organization');
  const currency = input.currency;
  if (typeof currency !== 'string' || !/^[A-Z]{3}$/.test(currency)) throw new Error('Invalid ISO currency');
  if (!Array.isArray(input.payments) || !Array.isArray(input.settlements)) throw new Error('Expected payment and settlement arrays');
  if (input.payments.length > 10000 || input.settlements.length > 10000) throw new Error('Reconciliation batch is too large');
  const payments = input.payments.map(x => normalize(x, 'payment', orgId, currency));
  const settlements = input.settlements.map(x => normalize(x, 'settlement', orgId, currency));
  for (const items of [payments, settlements]) {
    const sideIds = new Set();
    for (const item of items) {
      if (sideIds.has(item.id)) throw new Error('Duplicate record id within reconciliation side');
      sideIds.add(item.id);
    }
  }
  const index = list => {
    const map = new Map();
    for (const entry of list) {
      const k = key(entry);
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(entry);
    }
    return map;
  };
  const payByKey = index(payments), settlementByKey = index(settlements);
  const allKeys = [...new Set([...payByKey.keys(), ...settlementByKey.keys()])].sort();
  const matched = [], exceptions = [];
  for (const k of allKeys) {
    const p = payByKey.get(k) || [], s = settlementByKey.get(k) || [];
    if (p.length > 1 || s.length > 1) {
      exceptions.push({type:'duplicate_reference', paymentIds:p.map(x=>x.id), settlementIds:s.map(x=>x.id)});
    } else if (!p.length) {
      exceptions.push({type:'unmatched_settlement', settlementId:s[0].id, amountMinor:s[0].amountMinor});
    } else if (!s.length) {
      exceptions.push({type:'unmatched_payment', paymentId:p[0].id, amountMinor:p[0].amountMinor});
    } else if (p[0].amountMinor !== s[0].amountMinor) {
      exceptions.push({type:'amount_mismatch', paymentId:p[0].id, settlementId:s[0].id,
        paymentAmountMinor:p[0].amountMinor, settlementAmountMinor:s[0].amountMinor});
    } else {
      matched.push({paymentId:p[0].id, settlementId:s[0].id, provider:p[0].provider,
        reference:p[0].reference, amountMinor:p[0].amountMinor});
    }
  }
  const matchedAmountMinor = matched.reduce((sum,x)=>sum + x.amountMinor,0);
  if (!Number.isSafeInteger(matchedAmountMinor)) throw new Error('Reconciliation total exceeds safe integer range');
  return {matched, exceptions, summary: {orgId, currency, paymentCount:payments.length,
    settlementCount:settlements.length, matchedCount:matched.length, exceptionCount:exceptions.length,
    matchedAmountMinor, readyForAutomaticPosting:false}};
}
