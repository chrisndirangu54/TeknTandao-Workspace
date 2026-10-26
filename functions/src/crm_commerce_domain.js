export function crmCommerceSummary(contacts,deals,sales,invoices) {
 if ([contacts,deals,sales,invoices].some(a=>!Array.isArray(a)||a.length>500)) throw new Error('Report size unsupported');
 const money=v=>Number.isSafeInteger(v)&&v>=0?v:0;
 return contacts.map(c=>{
  const d=deals.filter(x=>x.contactId===c.id);
  const s=sales.filter(x=>x.contactId===c.id);
  const i=invoices.filter(x=>x.contactId===c.id);
  return {contactId:c.id,name:c.name||'Unnamed',
   wonDeals:d.filter(x=>x.stage==='won').length,
   wonOpportunityMinor:d.filter(x=>x.stage==='won').reduce((a,x)=>a+money(x.amountMinor),0),
   posSaleCount:s.length,posSaleMinor:s.reduce((a,x)=>a+money(x.total),0),
   invoiceCount:i.length,invoiceMinor:i.reduce((a,x)=>a+money(x.total),0),
   paidInvoiceStatusCount:i.filter(x=>x.paymentState==='paid').length};
 });
}
