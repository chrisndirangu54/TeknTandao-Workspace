import test from 'node:test';
import assert from 'node:assert/strict';
import {planStockTransfer,planPurchaseReceipt,evaluateReorderPoint} from '../src/inventory_procurement_domain.js';

test('warehouse transfer prevents overselling and same-location transfers',()=>{
 const input={requestId:'x',sku:'tea',fromWarehouse:'A',toWarehouse:'B',quantity:3,available:5,destinationStock:2};
 assert.equal(planStockTransfer(input).resultingSource,2);
 assert.equal(planStockTransfer(input).resultingDestination,5);
 assert.throws(()=>planStockTransfer({...input,quantity:6}),/Insufficient/);
 assert.throws(()=>planStockTransfer({...input,toWarehouse:'A'}),/different/);
});
test('purchase receipt stays within ordered quantity',()=>{
 const input={requestId:'r1',purchaseOrderId:'p1',sku:'tea',ordered:10,receivedPreviously:4,receiving:6};
 assert.equal(planPurchaseReceipt(input).status,'fully_received');
 assert.throws(()=>planPurchaseReceipt({...input,receiving:7}),/exceeds/);
});
test('reorder policy accounts for reserved inventory and open orders',()=>{
 assert.deepEqual(evaluateReorderPoint({onHand:20,reserved:5,onOrder:2,dailyDemand:4,leadDays:5,safetyStock:3}),
 {inventoryPosition:17,reorderPoint:23,recommendedQuantity:6});
});
