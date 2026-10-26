export function planCustomerAllocationReversal(invoice,settlement,allocation){
 if(!invoice||!settlement||!allocation)throw new Error('Records required');
 if(settlement.disputeState!=='frozen')throw new Error('Settlement must be frozen');
 if(allocation.reversalStatus==='reversed')return {status:'already_reversed'};
 if(allocation.reversalStatus)throw new Error('Allocation reversal already pending');
 if(allocation.settlementId!==settlement.id||allocation.invoiceId!==invoice.id)
  throw new Error('Allocation reference mismatch');
 const n=allocation.amountMinor,invUsed=invoice.allocatedMinor,payUsed=settlement.allocatedMinor;
 if(![n,invUsed,payUsed,invoice.total,settlement.amountMinor].every(Number.isSafeInteger)||
 n<=0||invUsed<n||payUsed<n||invoice.total<invUsed||settlement.amountMinor<payUsed)
  throw new Error('Inconsistent financial balances');
 return {status:'review_required',reversalMinor:n,
  projectedInvoiceOutstandingMinor:invoice.total-invUsed+n,
  projectedPaymentAvailableMinor:settlement.amountMinor-payUsed+n,
  note:'Projection only. Refund or chargeback confirmation and a balanced accounting reversal are required before posting.'};
}
