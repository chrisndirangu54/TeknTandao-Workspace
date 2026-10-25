import {identifier,money} from './domain.js';
export function planSupplierInvoiceMatch({invoiceId,purchaseOrderId,supplierId,sku,warehouseId,units,unitPriceMinor,received,previouslyInvoiced=0,ordered,status}){
  for(const id of [invoiceId,purchaseOrderId,supplierId,sku,warehouseId])identifier(id);
  if(!['approved','partially_received','fully_received'].includes(status))throw new Error('Order not eligible for invoicing');
  for(const n of [units,received,previouslyInvoiced,ordered]){
    if(!Number.isSafeInteger(n)||n<0||n>1000000000)throw new Error('Invalid purchase order quantities');
  }
  if(units===0||received>ordered||previouslyInvoiced+units>received||previouslyInvoiced+units>ordered)
    throw new Error('Invoice quantity exceeds received uninvoiced goods');
  const price=money(unitPriceMinor);
  if(price===0)throw new Error('Positive unit price required');
  const total=units*price;
  if(!Number.isSafeInteger(total)||total>1000000000)throw new Error('Invoice total exceeds limit');
  return {invoiceId,purchaseOrderId,supplierId,sku,warehouseId,units,unitPriceMinor:price,
    totalMinor:total,invoicedTotal:previouslyInvoiced+units,currency:'KES',status:'matched_pending_accounting'};
}
