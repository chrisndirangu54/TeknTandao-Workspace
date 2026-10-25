import {identifier} from './domain.js';
function units(n){if(!Number.isSafeInteger(n)||n<0||n>1000000000)throw new Error('Invalid stock quantity');return n;}
export function reconcileInventory({products,warehouses,batches}){
  if(![products,warehouses,batches].every(Array.isArray))throw new Error('Inventory arrays required');
  const totals=new Map(),assigned=new Map(),issues=[];
  for(const w of warehouses){
    const sku=identifier(w.sku),warehouseId=identifier(w.warehouseId),q=units(w.quantity);
    totals.set(sku,(totals.get(sku)||0)+q);
    if(totals.get(sku)>1000000000)throw new Error('Stock aggregate overflow');
  }
  for(const b of batches){
    const key=identifier(b.warehouseId)+'__'+identifier(b.sku);
    assigned.set(key,(assigned.get(key)||0)+units(b.quantity));
    if(assigned.get(key)>1000000000)throw new Error('Batch aggregate overflow');
  }
  const stockKeys=new Set(warehouses.map(w=>w.warehouseId+'__'+w.sku));
  for(const w of warehouses){
    const key=w.warehouseId+'__'+w.sku;
    const tracked=assigned.get(key)||0;
    if(tracked>units(w.quantity))issues.push({type:'batch_exceeds_warehouse',sku:w.sku,warehouseId:w.warehouseId,warehouse:units(w.quantity),tracked});
  }
  for(const b of batches){
    const key=b.warehouseId+'__'+b.sku;
    if(!stockKeys.has(key))issues.push({type:'orphan_batch',sku:b.sku,warehouseId:b.warehouseId,batchId:b.batchId});
  }
  const seen=new Set();
  for(const p of products){
    const sku=identifier(p.sku);if(seen.has(sku))throw new Error('Duplicate SKU');seen.add(sku);
    const canonical=units(p.stock),warehouseTotal=totals.get(sku)||0;
    if(canonical!==warehouseTotal)issues.push({type:'product_warehouse_mismatch',sku,canonical,warehouseTotal});
  }
  for(const sku of totals.keys())if(!seen.has(sku))issues.push({type:'orphan_warehouse_stock',sku});
  return {ok:issues.length===0,issues,checked:{products:products.length,warehouses:warehouses.length,batches:batches.length}};
}
