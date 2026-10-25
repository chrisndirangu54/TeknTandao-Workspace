import {identifier, money} from './domain.js';

// Inventory adjustments are proposals only. Persist atomically with a stock
// version precondition and an idempotency key in the authorized backend.
export function planStockTransfer({requestId, sku, fromWarehouse, toWarehouse, quantity, available, destinationStock = 0}) {
  const id = identifier(requestId);
  const productId = identifier(sku);
  const source = identifier(fromWarehouse);
  const destination = identifier(toWarehouse);
  if (source === destination) throw new Error('Transfer requires different warehouses');
  if (!Number.isSafeInteger(quantity) || quantity <= 0) throw new Error('Invalid quantity');
  if (!Number.isSafeInteger(available) || available < quantity) throw new Error('Insufficient warehouse stock');
  if (!Number.isSafeInteger(destinationStock) || destinationStock < 0 ||
      !Number.isSafeInteger(destinationStock + quantity)) throw new Error('Invalid destination stock');
  return {requestId:id, sku:productId, fromWarehouse:source, toWarehouse:destination,
    quantity, resultingSource:available-quantity, resultingDestination:destinationStock+quantity,
    status:'pending_commit'};
}
export function planPurchaseReceipt({requestId, purchaseOrderId, sku, ordered, receivedPreviously = 0, receiving}) {
  const id = identifier(requestId);
  const orderId = identifier(purchaseOrderId);
  const productId = identifier(sku);
  if (![ordered,receivedPreviously,receiving].every(n=>Number.isSafeInteger(n)&&n>=0) ||
      ordered<=0 || receiving<=0 || receivedPreviously+receiving>ordered) {
    throw new Error('Receipt quantity exceeds outstanding purchase order');
  }
  return {requestId:id,purchaseOrderId:orderId,sku:productId,receiving,
    receivedTotal:receivedPreviously+receiving,remaining:ordered-receivedPreviously-receiving,
    status:receivedPreviously+receiving===ordered?'fully_received':'partially_received'};
}
export function evaluateReorderPoint({onHand, reserved = 0, onOrder = 0, dailyDemand, leadDays, safetyStock = 0}) {
  const inputs=[onHand,reserved,onOrder,dailyDemand,leadDays,safetyStock];
  if (!inputs.every(n=>Number.isSafeInteger(n)&&n>=0) || reserved>onHand)
    throw new Error('Invalid inventory forecast inputs');
  const position=onHand-reserved+onOrder;
  const target=money(dailyDemand*leadDays+safetyStock);
  return {inventoryPosition:position,reorderPoint:target,recommendedQuantity:Math.max(0,target-position)};
}
