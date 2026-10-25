import {identifier} from './domain.js';

export function planBatchReceipt({requestId,sku,warehouseId,batchId,quantity,expiryAt=null,existing=0}) {
  for (const id of [requestId,sku,warehouseId,batchId]) identifier(id);
  if (!Number.isSafeInteger(quantity) || quantity<=0 || quantity>1000000000) throw new Error('Invalid received quantity');
  if (!Number.isSafeInteger(existing) || existing<0 || existing+quantity>1000000000) throw new Error('Invalid existing batch quantity');
  if (expiryAt!==null && (typeof expiryAt!=='string' || !/^\d{4}-\d{2}-\d{2}$/.test(expiryAt) ||
    !Number.isFinite(Date.parse(expiryAt+'T00:00:00Z')))) throw new Error('Invalid batch expiry date');
  return {requestId,sku,warehouseId,batchId,quantity,resultingQuantity:existing+quantity,expiryAt};
}
export function allocateBatchesFEFO({quantity,batches,asOf=new Date().toISOString().slice(0,10)}) {
  if (!Number.isSafeInteger(quantity) || quantity<=0 || quantity>1000000000) throw new Error('Invalid allocation quantity');
  if (!Array.isArray(batches) || batches.length>1000) throw new Error('Invalid batch list');
  const available=batches.map(b=>{
    identifier(b.batchId);
    if (!Number.isSafeInteger(b.quantity) || b.quantity<0 || b.quantity>1000000000) throw new Error('Invalid batch stock');
    if (b.expiryAt && (typeof b.expiryAt!=='string' || !/^\d{4}-\d{2}-\d{2}$/.test(b.expiryAt))) throw new Error('Invalid expiry date');
    return b;
  }).filter(b=>b.quantity>0 && (!b.expiryAt || b.expiryAt>=asOf)).sort((a,b)=>
    (a.expiryAt || '9999-12-31').localeCompare(b.expiryAt || '9999-12-31') || a.batchId.localeCompare(b.batchId));
  let outstanding=quantity;
  const allocations=[];
  for (const batch of available) {
    const take=Math.min(outstanding,batch.quantity);
    if (take>0) allocations.push({batchId:batch.batchId,quantity:take});
    outstanding-=take;
    if (!outstanding) break;
  }
  if (outstanding) throw new Error('Insufficient non-expired batch stock');
  return {quantity,allocations};
}
