import {validateConfirmedReversal} from './customer_reversal_posting_domain.js';
import {planCustomerAllocationReversal} from './customer_allocation_reversal_domain.js';
export function planPostedCustomerReversal({invoice,settlement,allocation,review,evidence}){
 if(review?.status!=='pending_provider_evidence'||review.allocationId!==allocation?.id||
 review.invoiceId!==invoice?.id||review.settlementId!==settlement?.id)
 throw new Error('Reversal review references do not match');
 if(evidence?.trustBoundary!=='server_provider_verified'||evidence?.allocationId!==allocation.id||
 evidence?.settlementId!==settlement.id||evidence?.invoiceId!==invoice.id)
 throw new Error('Server-verified refund evidence required');
 const plan=planCustomerAllocationReversal(invoice,settlement,allocation);
 if(plan.status!=='review_required')throw new Error('Reversal already applied');
 const verification=validateConfirmedReversal(allocation,settlement,evidence);
 if(verification.alreadyReversed||verification.amountMinor!==plan.reversalMinor)
 throw new Error('Reversal amount mismatch');
 return {...plan,journal:verification.journal,
  invoiceAllocatedMinor:invoice.allocatedMinor-plan.reversalMinor,
  settlementAllocatedMinor:settlement.allocatedMinor-plan.reversalMinor};
}
