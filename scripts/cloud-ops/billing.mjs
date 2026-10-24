// Calculate managed-service charges using verified usage and a signed customer rate card.
// Excludes VAT, discounts, exchange rates and payment processing; no payment collection.
export function computeInvoice({usageUsd,markupPercent,managedServiceKes,exchangeKesPerUsd}){
 for(const n of [usageUsd,markupPercent,managedServiceKes,exchangeKesPerUsd])
  if(!Number.isFinite(n)||n<0)throw Error('Invalid nonnegative invoice parameter');
 if(markupPercent>100||exchangeKesPerUsd===0)throw Error('Invalid rate card');
 const usageKes=Math.round(usageUsd*exchangeKesPerUsd*100)/100;
 const markupKes=Math.round(usageKes*markupPercent)/100;
 const subtotalKes=Math.round((usageKes+markupKes+managedServiceKes)*100)/100;
 return {usageKes,markupKes,managedServiceKes,subtotalKes,currency:'KES',
   state:'draft_requires_usage_reconciliation_and_approval',paymentCollected:false};
}
