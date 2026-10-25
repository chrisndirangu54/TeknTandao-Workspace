import './index.js';
import {getFirestore, FieldValue} from 'firebase-admin/firestore';
import {onCall, HttpsError} from 'firebase-functions/v2/https';
import {identifier, canAccess} from './domain.js';
import {planStockTransfer, planPurchaseReceipt} from './inventory_procurement_domain.js';
import {planBatchReceipt, allocateBatchesFEFO} from './inventory_batches_domain.js';
import {reconcileInventory} from './inventory_reconciliation_domain.js';
import {planSupplierInvoiceMatch} from './supplier_invoice_domain.js';
import {supplierBillJournal} from './ledger_domain.js';
import {supplierPayablesAging} from './payables_aging_domain.js';

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
    const [sourceLots,destLots]=await Promise.all([
      tx.get(org.collection('inventoryBatches').where('warehouseId','==',fromWarehouse).where('sku','==',sku)),
      tx.get(org.collection('inventoryBatches').where('warehouseId','==',toWarehouse).where('sku','==',sku))
    ]);
    let allocations=[];
    if(!sourceLots.empty){
      allocations=allocateBatchesFEFO({quantity:amount,batches:sourceLots.docs.map(d=>({
        batchId:d.data().batchId,quantity:d.data().quantity,expiryAt:d.data().expiryAt||null
      }))}).allocations;
      for(const allocation of allocations){
        const lot=sourceLots.docs.find(d=>d.data().batchId===allocation.batchId);
        const destinationLotRef=org.collection('inventoryBatches').doc(
          `${toWarehouse}__${sku}__${allocation.batchId}`);
        const destinationLot=destLots.docs.find(d=>d.ref.path===destinationLotRef.path);
        if(destinationLot && (destinationLot.data().expiryAt||null)!==(lot.data().expiryAt||null))
          throw new Error('Destination batch expiry mismatch');
        const destQuantity=quantity(destinationLot?.data().quantity||0);
        if(destQuantity+allocation.quantity>1000000000) throw new Error('Destination batch overflow');
        tx.update(lot.ref,{quantity:quantity(lot.data().quantity)-allocation.quantity,updatedAt:stamp()});
        tx.set(destinationLotRef,{warehouseId:toWarehouse,sku,batchId:allocation.batchId,
          expiryAt:lot.data().expiryAt||null,quantity:destQuantity+allocation.quantity,updatedAt:stamp()},{merge:true});
      }
    }
    tx.update(source,{quantity:plan.resultingSource,updatedAt:stamp()});
    tx.set(destination,{warehouseId:toWarehouse,sku,quantity:plan.resultingDestination,updatedAt:stamp()},{merge:true});
    tx.create(movement,{type:'transfer',requestId:id,sku,fromWarehouse,toWarehouse,quantity:amount,allocations,
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
  const supplierId=identifier(request.data.supplierId || 'unassigned');
  if(!ordered) throw new Error('Ordered quantity must be positive');
  const ref=org.collection('purchaseOrders').doc(id);
  return db.runTransaction(async tx=>{
    const [prior,supplier]=await Promise.all([tx.get(ref),supplierId==='unassigned'?Promise.resolve(null):tx.get(org.collection('suppliers').doc(supplierId))]);
    if(supplierId!=='unassigned'&&!supplier?.exists) throw new Error('Supplier not found in organization');
    if(prior.exists) {
      const d=prior.data();
      if(d.sku!==sku || d.warehouseId!==warehouseId || d.ordered!==ordered || (d.supplierId||'unassigned')!==supplierId)
        throw new Error('Purchase order ID already used');
      return {id,status:d.status,replayed:true};
    }
    tx.create(ref,{sku,warehouseId,supplierId,ordered,received:0,status:'draft',createdBy:uid,
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

export const cancelWarehousePurchaseOrder = callable(async request => {
  const {org,uid}=await authorized(request,'procurement');
  const membership=await org.collection('members').doc(uid).get();
  if(membership.data()?.role!=='owner') throw new HttpsError('permission-denied','Owner required to cancel purchase orders');
  const id=identifier(request.data.purchaseOrderId);
  const ref=org.collection('purchaseOrders').doc(id);
  return db.runTransaction(async tx=>{
    const snap=await tx.get(ref);
    if(!snap.exists) throw new Error('Purchase order not found');
    const order=snap.data();
    if(order.status==='cancelled') return {id,status:'cancelled',replayed:true};
    if(!['draft','approved'].includes(order.status)||quantity(order.received||0)>0)
      throw new Error('Cannot cancel an order with received stock');
    tx.update(ref,{status:'cancelled',cancelledBy:uid,cancelledAt:stamp(),updatedAt:stamp()});
    return {id,status:'cancelled',replayed:false};
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

// Batch receipts are separate from purchasing: these represent tagged stock
// already counted in the warehouse, avoiding double-increment of SKU totals.
export const assignWarehouseStockBatch = callable(async request => {
  const {org,uid}=await authorized(request,'inventory');
  const {requestId,sku,warehouseId,batchId,expiryAt=null}=request.data;
  const id=identifier(requestId),product=identifier(sku),warehouse=identifier(warehouseId),batch=identifier(batchId);
  const count=quantity(request.data.quantity);
  if(!count) throw new Error('Batch quantity must be positive');
  const movement=org.collection('inventoryMovements').doc(id);
  const warehouseRef=inventoryRef(org,warehouse,product);
  const batchRef=org.collection('inventoryBatches').doc(`${warehouse}__${product}__${batch}`);
  return db.runTransaction(async tx=>{
    const [prior,warehouseSnap,batchSnap]=await Promise.all([
      tx.get(movement),tx.get(warehouseRef),tx.get(batchRef)
    ]);
    if(prior.exists){
      const d=prior.data();
      if(d.type!=='batch_assignment'||d.sku!==product||d.warehouseId!==warehouse||
         d.batchId!==batch||d.quantity!==count||d.expiryAt!==expiryAt)
        throw new Error('Movement ID already used');
      return {requestId:id,status:'committed',replayed:true};
    }
    if(!warehouseSnap.exists) throw new Error('Warehouse balance not found');
    const plan=planBatchReceipt({requestId:id,sku:product,warehouseId:warehouse,
      batchId:batch,quantity:count,expiryAt,existing:quantity(batchSnap.data()?.quantity||0)});
    const allBatches=await tx.get(org.collection('inventoryBatches')
      .where('warehouseId','==',warehouse).where('sku','==',product));
    const assigned=allBatches.docs.reduce((n,d)=>n+quantity(d.data().quantity),0);
    if(assigned+count>quantity(warehouseSnap.data().quantity))
      throw new Error('Batch assignments exceed warehouse stock');
    if(batchSnap.exists && batchSnap.data().expiryAt!==expiryAt)
      throw new Error('Existing batch expiry cannot change');
    tx.set(batchRef,{sku:product,warehouseId:warehouse,batchId:batch,
      expiryAt,quantity:plan.resultingQuantity,updatedAt:stamp()},{merge:true});
    tx.create(movement,{type:'batch_assignment',sku:product,warehouseId:warehouse,batchId:batch,
      expiryAt,quantity:count,createdBy:uid,createdAt:stamp(),status:'committed'});
    return {requestId:id,status:'committed',replayed:false};
  });
});

 
export const auditWarehouseInventory = callable(async request => {
  const {org,uid}=await authorized(request,'inventory');
  const member=await org.collection('members').doc(uid).get();
  if(member.data()?.role!=='owner') throw new HttpsError('permission-denied','Owner required for reconciliation');
  const [products,warehouses,batches]=await Promise.all([
    org.collection('products').limit(501).get(),
    org.collection('warehouseStock').limit(501).get(),
    org.collection('inventoryBatches').limit(501).get()
  ]);
  if([products,warehouses,batches].some(s=>s.size>500))
    throw new HttpsError('resource-exhausted','Reconciliation requires paginated processing above 500 records');
  return reconcileInventory({
    products:products.docs.map(d=>({sku:d.id,stock:d.data().stock})),
    warehouses:warehouses.docs.map(d=>d.data()),
    batches:batches.docs.map(d=>d.data())
  });
});


// A matched supplier bill is a pending accounting document, not a paid invoice.
// Requires an independently approved PO, actual received units and owner approval.
export const matchSupplierInvoice = callable(async request => {
  const {org,uid}=await authorized(request,'procurement');
  const membership=await org.collection('members').doc(uid).get();
  if(membership.data()?.role!=='owner') throw new HttpsError('permission-denied','Owner required to match supplier invoices');
  const id=identifier(request.data.invoiceId),orderId=identifier(request.data.purchaseOrderId);
  const units=quantity(request.data.units),unitPriceMinor=quantity(request.data.unitPriceMinor);
  const invoice=org.collection('supplierInvoices').doc(id),po=org.collection('purchaseOrders').doc(orderId);
  return db.runTransaction(async tx=>{
    const [prior,orderSnap]=await Promise.all([tx.get(invoice),tx.get(po)]);
    if(prior.exists) {
      const d=prior.data();
      if(d.purchaseOrderId!==orderId||d.units!==units||d.unitPriceMinor!==unitPriceMinor)
        throw new Error('Supplier invoice ID already used');
      return {id,status:d.status,replayed:true};
    }
    if(!orderSnap.exists) throw new Error('Purchase order not found');
    const order=orderSnap.data();
    if(!order.supplierId||order.supplierId==='unassigned')
      throw new Error('Verified supplier required before invoice matching');
    const plan=planSupplierInvoiceMatch({invoiceId:id,purchaseOrderId:orderId,
      supplierId:order.supplierId,sku:order.sku,warehouseId:order.warehouseId,
      units,unitPriceMinor,received:quantity(order.received||0),
      previouslyInvoiced:quantity(order.invoiced||0),ordered:quantity(order.ordered),status:order.status});
    const dueDate=request.data.dueDate;
    if(typeof dueDate!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(dueDate)||!Number.isFinite(Date.parse(dueDate+'T00:00:00Z'))) throw new Error('Valid supplier invoice dueDate YYYY-MM-DD required');
    tx.create(invoice,{...plan,dueDate,settledMinor:0,createdBy:uid,createdAt:stamp(),accountingState:'not_posted',
      paymentState:'unpaid'});
    tx.update(po,{invoiced:plan.invoicedTotal,updatedAt:stamp()});
    return {id,status:plan.status,totalMinor:plan.totalMinor,replayed:false};
  });
});


// Posting is separate from three-way match and cannot imply tax compliance or payment.
// The journal and state transition are atomic and idempotent.
export const postMatchedSupplierBill = callable(async request => {
  const {org,uid}=await authorized(request,'procurement');
  await authorized(request,'accounting');
  const member=await org.collection('members').doc(uid).get();
  if(member.data()?.role!=='owner')throw new HttpsError('permission-denied','Owner required to post supplier bill');
  const id=identifier(request.data.invoiceId);
  const invoiceRef=org.collection('supplierInvoices').doc(id);
  const journalRef=org.collection('journals').doc(`supplier_bill_${id}`);
  return db.runTransaction(async tx=>{
    const [invoice,journal]=await Promise.all([tx.get(invoiceRef),tx.get(journalRef)]);
    if(!invoice.exists)throw new Error('Matched supplier invoice not found');
    const bill=invoice.data();
    if(bill.accountingState==='posted'){
      if(!journal.exists)throw new Error('Posted bill has no journal; reconcile ledger manually');
      return {id,status:'posted',replayed:true};
    }
    if(bill.status!=='matched_pending_accounting'||bill.accountingState!=='not_posted'||journal.exists)
      throw new Error('Bill cannot be posted in current state');
    if(bill.currency!=='KES'||bill.paymentState!=='unpaid')throw new Error('Unexpected supplier bill state');
    const entry=supplierBillJournal(bill.totalMinor);
    tx.create(journalRef,{...entry,sourceType:'supplier_bill',sourceId:id,
      createdBy:uid,createdAt:stamp()});
    tx.update(invoiceRef,{accountingState:'posted',postedBy:uid,postedAt:stamp(),updatedAt:stamp()});
    return {id,status:'posted',replayed:false,totalMinor:entry.total};
  });
});


export const getSupplierPayablesAging = callable(async request => {
  const {org,uid}=await authorized(request,'accounting');
  const member=await org.collection('members').doc(uid).get();
  if(member.data()?.role!=='owner')throw new HttpsError('permission-denied','Owner required for payable aging');
  const docs=await org.collection('supplierInvoices').limit(501).get();
  if(docs.size>500)throw new HttpsError('resource-exhausted','Use paginated payables reporting for more than 500 bills');
  const asOf=request.data.asOf;
  return supplierPayablesAging(docs.docs.map(d=>({id:d.id,...d.data()})),asOf);
});
