import {identifier,money} from './domain.js';

// Server-produced immutable price snapshot; never recalculate historic receipts
// from live catalog prices or assert that an unpaid sale was settled.
export function buildPosSaleSnapshot({saleId,productId,productName,contactId,quantity,unitPriceMinor,totalMinor,warehouseId}){
 const id=identifier(saleId),sku=identifier(productId),customer=identifier(contactId),warehouse=identifier(warehouseId);
 if(typeof productName!=='string'||!productName.trim()||productName.length>200)throw new Error('Invalid product name');
 if(!Number.isSafeInteger(quantity)||quantity<1||quantity>10000)throw new Error('Invalid quantity');
 const unit=money(unitPriceMinor),total=money(totalMinor);
 if(!unit||!Number.isSafeInteger(unit*quantity)||unit*quantity!==total)throw new Error('Sale line total mismatch');
 return {saleId:id,productId:sku,productName:productName.trim(),contactId:customer,
  warehouseId:warehouse,quantity,unitPriceMinor:unit,totalMinor:total,currency:'KES'};
}
export function posReceipt(sale,id){
 if(!sale||!id)throw new Error('Sale required');
 if(sale.currency!=='KES'||sale.paymentState==='paid' && sale.paymentVerified!==true)
  throw new Error('Unverified sale settlement');
 if(sale.kind==='pos_cart'){
  if(!Array.isArray(sale.lines)||sale.lines.length===0||
     sale.lines.reduce((n,l)=>n+l.totalMinor,0)!==sale.total)
    throw new Error('Cart receipt lines unavailable or inconsistent');
  return {receiptId:'POS-'+id,currency:'KES',lines:sale.lines.map(l=>({
    productId:l.productId,name:l.name,quantity:l.quantity,
    unitPriceMinor:l.unitPriceMinor,totalMinor:l.totalMinor
  })),totalMinor:sale.total,createdAt:sale.createdAt||null,
  paymentState:sale.paymentState,paid:sale.paymentState==='paid'&&sale.paymentVerified===true,
  taxInvoice:false,notice:'Sale record only; payment and fiscal tax invoice not confirmed.'};
 }
 const snapshot=sale.receiptSnapshot;
 if(!snapshot||snapshot.saleId!==id||snapshot.totalMinor!==sale.total||
    snapshot.quantity!==sale.quantity||snapshot.productId!==sale.productId)
  throw new Error('Sale receipt snapshot unavailable or inconsistent');
 return {receiptId:'POS-'+id,createdAt:sale.createdAt||null,...snapshot,
  paymentState:sale.paymentState,paid:sale.paymentState==='paid'&&sale.paymentVerified===true,
  taxInvoice:false,notice:'Sale record only. This receipt is not a fiscal tax invoice or payment confirmation.'};
}
