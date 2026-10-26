export function crmInvoiceReconciliation(invoices,sales,contacts){
 if([invoices,sales,contacts].some(a=>!Array.isArray(a)||a.length>500))
  throw new Error('Reconciliation report limit exceeded');
 const saleById=new Map(sales.map(s=>[s.id,s]));
 const contactById=new Map(contacts.map(c=>[c.id,c]));
 const rows=invoices.map(i=>{
  const sale=i.saleId?saleById.get(i.saleId):null;
  const customer=contactById.get(i.contactId);
  const invoiceMinor=Number.isSafeInteger(i.total)&&i.total>=0?i.total:null;
  const matchingSale=sale&&sale.contactId===i.contactId&&sale.total===i.total;
  const issue=!i.saleId?'missing_sale_link':!sale?'sale_not_in_snapshot':
   !matchingSale?'sale_invoice_mismatch':null;
  return {invoiceId:i.id,contactId:i.contactId,customerName:customer?.name||null,
   saleId:i.saleId||null,invoiceMinor,invoiceStatus:i.status||'unknown',
   paymentState:i.paymentState||'unknown',matchStatus:issue||'linked',
   verifiedCollectedMinor:null,verifiedOutstandingMinor:null,
   requiresPaymentEvidence:true};
 });
 return {invoices:rows,linkedInvoices:rows.filter(r=>r.matchStatus==='linked').length,
  unresolvedInvoices:rows.filter(r=>r.matchStatus!=='linked').length,
  verifiedCollectionsAvailable:false,
  note:'Subscription provider payments are not invoice collections. No customer cash collection or outstanding balance is asserted.'};
}
