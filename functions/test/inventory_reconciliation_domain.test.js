import test from 'node:test';
import assert from 'node:assert/strict';
import {reconcileInventory} from '../src/inventory_reconciliation_domain.js';
test('reconciles matching canonical and warehouse quantities',()=>{
 assert.equal(reconcileInventory({products:[{sku:'tea',stock:5}],warehouses:[{sku:'tea',warehouseId:'east',quantity:5}],batches:[{sku:'tea',warehouseId:'east',batchId:'b1',quantity:3}]}).ok,true);
});
test('detects mismatches, orphan batches and excessive assignments',()=>{
 const r=reconcileInventory({products:[{sku:'tea',stock:6}],warehouses:[{sku:'tea',warehouseId:'east',quantity:4}],batches:[{sku:'tea',warehouseId:'east',batchId:'b1',quantity:5},{sku:'tea',warehouseId:'west',batchId:'b2',quantity:1}]});
 assert.deepEqual(r.issues.map(i=>i.type),['batch_exceeds_warehouse','orphan_batch','product_warehouse_mismatch']);
});
