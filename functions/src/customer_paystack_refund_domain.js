export function verifiedPaystackRefundEvidence(refund,settlement,allocation,refundId){
 if(!refund||!settlement||!allocation)throw new Error('Refund verification inputs required');
 if(String(refund.id)!==String(refundId)||refund.status!=='processed')
  throw new Error('Refund has not been processed by Paystack');
 if(String(refund.transaction)!==String(settlement.providerTransactionId))
  throw new Error('Refund transaction does not match original payment');
 if(refund.currency!=='KES'||settlement.currency!=='KES'||
 !Number.isSafeInteger(refund.amount)||refund.amount!==allocation.amountMinor)
  throw new Error('Refund currency or amount mismatch');
 if(settlement.provider!=='paystack'||settlement.disputeState!=='frozen')
  throw new Error('Only frozen Paystack settlements are supported');
 return {status:'confirmed',kind:'refund',source:'paystack_api',
  trustBoundary:'server_provider_verified',providerReference:settlement.providerReference,
  amountMinor:refund.amount,providerRefundId:String(refund.id),
  allocationId:allocation.id,invoiceId:allocation.invoiceId,settlementId:allocation.settlementId};
}
