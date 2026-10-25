import './index.js';
import {getFirestore, FieldValue} from 'firebase-admin/firestore';
import {onCall, HttpsError} from 'firebase-functions/v2/https';
import {identifier, canAccess} from './domain.js';
import {planStockTransfer, planPurchaseReceipt} from './inventory_procurement_domain.js';

const db = getFirestore();
const stamp = () => FieldValue.serverTimestamp();
const callable = handler => onCall({region:'europe-west1'}, async request => {
  try { return await handler(request); }
  catch (e) {
    if (e instanceof HttpsError) throw e;
    throw new HttpsError('failed-precondition', e.message || 'Inventory operation failed');
  }
});
async function authorized(request, app) {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in first');
  const org = db.doc(`organizations/${identifier(request.data.orgId)}`);
  const [member, installation] = await Promise.all([
    org.collection('members').doc(request.auth.uid).get(),
    org.collection('apps').doc(app).get()
  ]);
  if (!canAccess(member.data(), app, installation.data()))
    throw new HttpsError('permission-denied', 'Inventory or procurement entitlement required');
  return {org, uid:request.auth.uid};
}
function quantity(value) {
  if (!Number.isSafeInteger(value) || value < 0 || value > 1000000000) throw new Error('Invalid stock quantity');
  return value;
}
function inventoryRef(org, warehouse, sku) {
  return org.collection('warehouseStock').doc(`${identifier(warehouse)}__${identifier(sku)}`);
}
// A warehouse transfer updates both stock records and movement ledger in one
// Firestore transaction. Replay requests must match exactly or are rejected.
export const transferWarehouseStock = callable(async request => {
  const {org,uid} = await authorized(request,'inventory');
  const {requestId,sku,fromWarehouse,toWarehouse} = request.data;
  const amount = quantity(request.data.quantity);
  if (!amount) throw new Error('Quantity must be positive');
  const id = identifier(requestId);
  const source = inventoryRef(org,fromWarehouse,sku);
  const destination = inventoryRef(org,toWarehouse,sku);
  if (source.path === destination.path) throw new Error('Transfer requires different warehouses');
  const movement = org.collection('inventoryMovements').doc(id);
  return db.runTransaction(async tx => {
    const [prior,src,dst] = await Promise.all([tx.get(movement),tx.get(source),tx.get(destination)]);
    if (prior.exists) {
      const data = prior.data();
      if (data.type !== 'transfer' || data.sku !== sku || data.fromWarehouse !== fromWarehouse ||
          data.toWarehouse !== toWarehouse || data.quantity !== amount) throw new Error('Movement ID already used');
      return {requestId:id,status:'committed',replayed:true};
    }
    const plan = planStockTransfer({requestId:id,sku,fromWarehouse,toWarehouse,quantity:amount,
      available:quantity(src.data()?.quantity ?? 0),destinationStock:quantity(dst.data()?.quantity ?? 0)});
    tx.update(source,{quantity:plan.resultingSource,updatedAt:stamp()});
    tx.set(destination,{warehouseId:toWarehouse,sku,quantity:plan.resultingDestination,updatedAt:stamp()},{merge:true});
    tx.create(movement,{type:'transfer',requestId:id,sku,fromWarehouse,toWarehouse,quantity:amount,
      createdBy:uid,createdAt:stamp(),status:'committed'});
    return {requestId:id,status:'committed',replayed:false};
  });
});
// Requires an existing approved purchase order and pre-existing SKU and warehouse stock record.
// Receiving never creates a financial payable or assumes payment has been made.
export const receivePurchaseOrderStock = callable(async request => {
  const {org,uid} = await authorized(request,'procurement');
  await authorized(request,'inventory');
  const {requestId,purchaseOrderId,sku,warehouseId} = request.data;
  const id=identifier(requestId), orderId=identifier(purchaseOrderId), product=identifier(sku);
  const warehouse=identifier(warehouseId), receiving=quantity(request.data.receiving);
  if (!receiving) throw new Error('Quantity must be positive');
  const movement=org.collection('inventoryMovements').doc(id);
  const po=org.collection('purchaseOrders').doc(orderId);
  const stock=inventoryRef(org,warehouse,product);
  return db.runTransaction(async tx=>{
    const [prior,poSnap,stockSnap]=await Promise.all([tx.get(movement),tx.get(po),tx.get(stock)]);
    if(prior.exists) {
      const d=prior.data();
      if(d.type!=='receipt' || d.purchaseOrderId!==orderId || d.sku!==product ||
         d.warehouseId!==warehouse || d.quantity!==receiving) throw new Error('Movement ID already used');
      return {requestId:id,status:'committed',replayed:true};
    }
    const order=poSnap.data();
    if(!order || !['approved','partially_received'].includes(order.status) ||
       order.sku!==product || order.warehouseId!==warehouse)
      throw new Error('Approved matching purchase order required');
    const plan=planPurchaseReceipt({requestId:id,purchaseOrderId:orderId,sku:product,
      ordered:quantity(order.ordered),receivedPreviously:quantity(order.received || 0),receiving});
    const onHand=quantity(stockSnap.data()?.quantity ?? 0);
    if(!Number.isSafeInteger(onHand+receiving) || onHand+receiving>1000000000)
      throw new Error('Stock quantity overflow');
    tx.update(po,{received:plan.receivedTotal,status:plan.status,updatedAt:stamp()});
    tx.set(stock,{warehouseId:warehouse,sku:product,quantity:onHand+receiving,updatedAt:stamp()},{merge:true});
    tx.create(movement,{type:'receipt',purchaseOrderId:orderId,warehouseId:warehouse,
      sku:product,quantity:receiving,createdBy:uid,createdAt:stamp(),status:'committed'});
    return {requestId:id,status:'committed',replayed:false,remaining:plan.remaining};
  });
});
