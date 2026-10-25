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
  const productRef=org.collection('products').doc(product);
  return db.runTransaction(async tx=>{
    const [prior,poSnap,stockSnap,productSnap]=await Promise.all([tx.get(movement),tx.get(po),tx.get(stock),tx.get(productRef)]);
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
    if(!productSnap.exists) throw new Error('Existing product SKU required');
    const productOnHand=quantity(productSnap.data().stock);
    if(productOnHand+receiving>1000000000) throw new Error('Product stock overflow');
    const onHand=quantity(stockSnap.data()?.quantity ?? 0);
    if(!Number.isSafeInteger(onHand+receiving) || onHand+receiving>1000000000)
      throw new Error('Stock quantity overflow');
    tx.update(productRef,{stock:productOnHand+receiving,updatedAt:stamp()});
    tx.update(po,{received:plan.receivedTotal,status:plan.status,updatedAt:stamp()});
    tx.set(stock,{warehouseId:warehouse,sku:product,quantity:onHand+receiving,updatedAt:stamp()},{merge:true});
    tx.create(movement,{type:'receipt',purchaseOrderId:orderId,warehouseId:warehouse,
      sku:product,quantity:receiving,createdBy:uid,createdAt:stamp(),status:'committed'});
    return {requestId:id,status:'committed',replayed:false,remaining:plan.remaining};
  });
});

 
// Bounded read model for a workspace inventory screen. No cross-tenant reads.
export const getWarehouseInventoryOverview = callable(async request => {
  const {org} = await authorized(request,'inventory');
  const [stock,movements] = await Promise.all([
    org.collection('warehouseStock').limit(200).get(),
    org.collection('inventoryMovements').limit(100).get()
  ]);
  return {
    stock:stock.docs.map(d=>({id:d.id,warehouseId:d.data().warehouseId,sku:d.data().sku,quantity:d.data().quantity})),
    movements:movements.docs.map(d=>({id:d.id,type:d.data().type,sku:d.data().sku,quantity:d.data().quantity,status:d.data().status})),
    limits:{stock:200,movements:100},
    truncated:{stock:stock.size===200,movements:movements.size===100}
  };
});

 
// Owner-controlled purchase order lifecycle. Approval is server-authoritative.
export const createWarehousePurchaseOrder = callable(async request => {
  const {org,uid}=await authorized(request,'procurement');
  const id=identifier(request.data.requestId);
  const sku=identifier(request.data.sku),warehouseId=identifier(request.data.warehouseId);
  const ordered=quantity(request.data.ordered);
  if(!ordered) throw new Error('Ordered quantity must be positive');
  const ref=org.collection('purchaseOrders').doc(id);
  return db.runTransaction(async tx=>{
    const prior=await tx.get(ref);
    if(prior.exists) {
      const d=prior.data();
      if(d.sku!==sku || d.warehouseId!==warehouseId || d.ordered!==ordered)
        throw new Error('Purchase order ID already used');
      return {id,status:d.status,replayed:true};
    }
    tx.create(ref,{sku,warehouseId,ordered,received:0,status:'draft',createdBy:uid,
      createdAt:stamp(),updatedAt:stamp()});
    return {id,status:'draft',replayed:false};
  });
});

export const approveWarehousePurchaseOrder = callable(async request => {
  const {org,uid}=await authorized(request,'procurement');
  const owner=await org.collection('members').doc(uid).get();
  if(owner.data()?.role!=='owner') throw new HttpsError('permission-denied','Workspace owner approval required');
  const id=identifier(request.data.purchaseOrderId);
  const ref=org.collection('purchaseOrders').doc(id);
  return db.runTransaction(async tx=>{
    const snap=await tx.get(ref);
    if(!snap.exists) throw new Error('Purchase order not found');
    const d=snap.data();
    if(d.status==='approved') return {id,status:'approved',replayed:true};
    if(d.status!=='draft' || d.received!==0) throw new Error('Only draft orders can be approved');
    tx.update(ref,{status:'approved',approvedBy:uid,approvedAt:stamp(),updatedAt:stamp()});
    return {id,status:'approved',replayed:false};
  });
});

export const getProcurementOrders = callable(async request => {
  const {org}=await authorized(request,'procurement');
  const result=await org.collection('purchaseOrders').limit(200).get();
  return {orders:result.docs.map(d=>({id:d.id,...d.data(),createdAt:null,updatedAt:null,approvedAt:null})),
    truncated:result.size===200};
});


// Legacy stock migration is intentionally one SKU at a time, owner-only and
// create-only. Existing warehouse balances are never replaced automatically.
export const migrateLegacyWarehouseStock = callable(async request => {
  const {org,uid}=await authorized(request,'inventory');
  const member=await org.collection('members').doc(uid).get();
  if(member.data()?.role!=='owner') throw new HttpsError('permission-denied','Owner required for stock migration');
  const sku=identifier(request.data.sku);
  const productRef=org.collection('products').doc(sku);
  return db.runTransaction(async tx=>{
    const product=await tx.get(productRef);
    if(!product.exists) throw new Error('Unknown SKU');
    const warehouseId=identifier(product.data().warehouseId || 'main');
    const ref=inventoryRef(org,warehouseId,sku);
    const existing=await tx.get(ref);
    if(existing.exists) {
      if(existing.data().quantity!==product.data().stock)
        throw new Error('Existing warehouse balance differs; manual reconciliation required');
      return {sku,warehouseId,status:'already_present'};
    }
    const units=quantity(product.data().stock);
    tx.create(ref,{warehouseId,sku,quantity:units,createdAt:stamp(),updatedAt:stamp(),
      migrationSource:'legacy_product',migratedBy:uid});
    return {sku,warehouseId,status:'migrated',quantity:units};
  });
});
