import test from 'node:test';
import assert from 'node:assert/strict';
import {recommendInventoryPurchases} from '../src/inventory_agent_domain.js';
const stock=[{id:'main__rice',sku:'rice',warehouseId:'main',quantity:4}];
const policies=[{id:'main__rice',sku:'rice',warehouseId:'main',dailyDemand:3,leadDays:5,safetyStock:5,reserved:1,onOrder:2,unitCostMinor:15000,supplierId:'s1'}];
test('reorder calculation includes reservations, incoming stock and lead-time demand',()=>{
 const report=recommendInventoryPurchases([{id:'rice',sku:'rice',name:'Rice'}],stock,policies);
 assert.equal(report.recommendations.length,1);
 assert.equal(report.recommendations[0].inventoryPosition,5);
 assert.equal(report.recommendations[0].reorderPoint,20);
 assert.equal(report.recommendations[0].recommendedQuantity,15);
 assert.equal(report.recommendations[0].estimatedCostMinor,225000);
 assert.equal(report.recommendations[0].status,'draft_only');
});
test('well stocked items do not trigger a purchase suggestion',()=>{
 const result=recommendInventoryPurchases([],[{...stock[0],quantity:100}],policies);
 assert.equal(result.totalRecommended,0);
});
test('unknown policies and corrupt quantity never trigger purchases',()=>{
 const missing=recommendInventoryPurchases([],stock,[]);
 assert.equal(missing.recommendations.length,0);
 assert.equal(missing.warnings[0].reason,'reorder_policy_missing');
 const invalid=recommendInventoryPurchases([],[{...stock[0],quantity:-5}],policies);
 assert.equal(invalid.recommendations.length,0);
 assert.equal(invalid.warnings[0].reason,'invalid_stock_or_policy');
});
