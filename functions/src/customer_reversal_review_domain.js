export function customerReversalReviewState(existing,plan){
 if(existing)return {create:false,status:existing.status};
 if(plan?.status!=='review_required'||!Number.isSafeInteger(plan.reversalMinor)||plan.reversalMinor<=0)
  throw new Error('Reversal is not eligible for provider review');
 return {create:true,status:'pending_provider_evidence',amountMinor:plan.reversalMinor};
}
