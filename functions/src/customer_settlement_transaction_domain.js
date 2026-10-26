const amount=v=>Number.isSafeInteger(v)&&v>=0?v:null;
export function customerSettlementAllocation(invoice,settlement,requested){
 const invoiceTotal=amount(invoice?.total),paymentTotal=amount(settlement?.amountMinor);
 if(invoiceTotal===null||paymentTotal===null||invoiceTotal===0||paymentTotal===0)
  throw new Error('Valid invoice and settlement totals required');
 if(settlement.verificationStatus!=='verified'||settlement.trustBoundary!=='provider_webhook_verified')
  throw new Error('Trusted provider verification required');
 if(!['daraja_api','paystack_api'].includes(settlement.verificationSource))
  throw new Error('Supported settlement provider required');
 if(invoice.contactId!==settlement.contactId||invoice.currency!=='KES'||settlement.currency!=='KES')
  throw new Error('Settlement identity or currency mismatch');
 const invoiceUsed=amount(invoice.allocatedMinor??0),paymentUsed=amount(settlement.allocatedMinor??0);
 if(invoiceUsed===null||paymentUsed===null||invoiceUsed>invoiceTotal||paymentUsed>paymentTotal)
  throw new Error('Invalid allocation counters');
 if(!Number.isSafeInteger(requested)||requested<=0||
  requested>invoiceTotal-invoiceUsed||requested>paymentTotal-paymentUsed)
  throw new Error('Allocation exceeds available balances');
 return {allocatedMinor:requested,invoiceAllocatedMinor:invoiceUsed+requested,
  settlementAllocatedMinor:paymentUsed+requested,
  invoiceOutstandingMinor:invoiceTotal-invoiceUsed-requested,
  settlementAvailableMinor:paymentTotal-paymentUsed-requested};
}
