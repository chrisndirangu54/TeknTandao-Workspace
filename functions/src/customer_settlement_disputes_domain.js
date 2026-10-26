export function settlementDisputeDecision(settlement,reason){
 if(!settlement||settlement.verificationStatus!=='verified')throw new Error('Verified settlement required');
 if(!['chargeback','refund_pending','provider_dispute'].includes(reason))throw new Error('Invalid dispute reason');
 if(settlement.disputeState==='frozen')return {status:'already_frozen'};
 if(settlement.disputeState&&settlement.disputeState!=='clear')throw new Error('Unrecognized settlement state');
 return {status:'freeze',disputeState:'frozen',disputeReason:reason};
}
export function eligibleSettlementForAllocation(settlement){
 if(settlement?.disputeState && settlement.disputeState!=='clear')
 throw new Error('Settlement frozen due to dispute or refund');
 return true;
}
