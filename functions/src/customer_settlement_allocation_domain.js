export function invoiceAllocationDecision(invoice,payment,priorAllocations,amountMinor){
 if(!invoice||!payment)throw new Error('Invoice and settlement evidence required');
 if(payment.verificationStatus!=='verified'||!['daraja_api','paystack_api','bank_statement_reconciled'].includes(payment.verificationSource))
  throw new Error('Verified settlement evidence required');
 if(payment.contactId!==invoice.contactId||payment.currency!=='KES'||invoice.currency!=='KES')
  throw new Error('Customer or currency mismatch');
 if(!Number.isSafeInteger(amountMinor)||amountMinor<=0)throw new Error('Invalid allocation amount');
 if(!Number.isSafeInteger(invoice.total)||invoice.total<=0||!Number.isSafeInteger(payment.amountMinor)||payment.amountMinor<=0)
  throw new Error('Invalid invoice or settlement amount');
 if(!Array.isArray(priorAllocations))throw new Error('Allocation history required');
 let allocated=0;
 const seen=new Set();
 for(const a of priorAllocations){
  if(!Number.isSafeInteger(a.amountMinor)||a.amountMinor<=0||typeof a.id!=='string'||seen.has(a.id))
   throw new Error('Invalid or duplicate allocation history');
  seen.add(a.id);allocated+=a.amountMinor;
 }
 const remaining=invoice.total-allocated;
 if(remaining<amountMinor)throw new Error('Invoice allocation exceeds outstanding value');
 if(amountMinor>payment.amountMinor)throw new Error('Allocation exceeds verified payment amount');
 return {amountMinor,remainingInvoiceMinor:remaining-amountMinor,status:remaining===amountMinor?'settled':'partial',
  evidenceSource:payment.verificationSource};
}
