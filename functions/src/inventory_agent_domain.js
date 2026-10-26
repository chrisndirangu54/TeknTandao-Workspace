import {evaluateReorderPoint} from './inventory_procurement_domain.js';

const nonnegative=n=>Number.isSafeInteger(n)&&n>=0&&n<=1000000000;
export function recommendInventoryPurchases(products,stock,policies,limit=50){
 if(![products,stock,policies].every(Array.isArray)||products.length>500||stock.length>500||policies.length>500||!Number.isInteger(limit)||limit<1||limit>100)
  throw new Error('Inventory Agent requires bounded verified input');
 const productBySku=new Map(products.map(p=>[p.sku||p.id,p]));
 const policyByKey=new Map(policies.map(p=>[p.id||p.warehouseId+'__'+p.sku,p]));
 const recommendations=[],warnings=[];
 for(const row of stock){
  const sku=row.sku,warehouseId=row.warehouseId,key=warehouseId+'__'+sku;
  if(typeof sku!=='string'||typeof warehouseId!=='string'){warnings.push({key:row.id||null,reason:'missing_sku_or_warehouse'});continue;}
  const policy=policyByKey.get(key),product=productBySku.get(sku);
  if(!policy){warnings.push({key,reason:'reorder_policy_missing'});continue;}
  const onHand=row.quantity,reserved=policy.reserved??0,onOrder=policy.onOrder??0;
  const dailyDemand=policy.dailyDemand,leadDays=policy.leadDays,safetyStock=policy.safetyStock??0;
  if(![onHand,reserved,onOrder,dailyDemand,leadDays,safetyStock].every(nonnegative)||reserved>onHand){
   warnings.push({key,reason:'invalid_stock_or_policy'});continue;
  }
  let plan;
  try{plan=evaluateReorderPoint({onHand,reserved,onOrder,dailyDemand,leadDays,safetyStock});}
  catch{warnings.push({key,reason:'reorder_calculation_failed'});continue;}
  if(!plan.recommendedQuantity)continue;
  const unitCostMinor=policy.unitCostMinor;
  const estimate=nonnegative(unitCostMinor)&&Number.isSafeInteger(plan.recommendedQuantity*unitCostMinor)?
   plan.recommendedQuantity*unitCostMinor:null;
  recommendations.push({sku,warehouseId,productName:String(product?.name||sku).slice(0,160),
   supplierId:policy.supplierId||null,onHand,inventoryPosition:plan.inventoryPosition,
   reorderPoint:plan.reorderPoint,recommendedQuantity:plan.recommendedQuantity,
   estimatedCostMinor:estimate,currency:'KES',reason:'inventory_position_below_reorder_point',
   status:'draft_only',requiresApproval:true});
 }
 recommendations.sort((a,b)=>(b.reorderPoint-b.inventoryPosition)-(a.reorderPoint-a.inventoryPosition));
 return {recommendations:recommendations.slice(0,limit),totalRecommended:recommendations.length,warnings,
  analyzedStockRecords:stock.length,readOnly:true,
  note:'Recommendations require maintained demand, lead-time and on-order policies; no purchase order was created.'};
}
