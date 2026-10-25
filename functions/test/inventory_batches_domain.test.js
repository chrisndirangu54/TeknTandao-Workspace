import test from 'node:test';
import assert from 'node:assert/strict';
import {planBatchReceipt,allocateBatchesFEFO} from '../src/inventory_batches_domain.js';

test('batch receiving validates quantities and expiry',()=>{
 assert.equal(planBatchReceipt({requestId:'r1',sku:'tea',warehouseId:'east',batchId:'b1',quantity:3,existing:2}).resultingQuantity,5);
 assert.throws(()=>planBatchReceipt({requestId:'r1',sku:'tea',warehouseId:'east',batchId:'b1',quantity:-1}),/quantity/);
});
test('FEFO prioritizes earliest available non-expired batches',()=>{
 const result=allocateBatchesFEFO({quantity:4,asOf:'2026-10-25',batches:[
  {batchId:'late',quantity:5,expiryAt:'2026-12-01'},
  {batchId:'expired',quantity:100,expiryAt:'2026-10-24'},
  {batchId:'soon',quantity:2,expiryAt:'2026-11-01'}]});
 assert.deepEqual(result.allocations,[{batchId:'soon',quantity:2},{batchId:'late',quantity:2}]);
 assert.throws(()=>allocateBatchesFEFO({quantity:99,asOf:'2026-10-25',batches:[{batchId:'a',quantity:1}]}),/Insufficient/);
});
