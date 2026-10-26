import {balanced,chart} from './ledger_domain.js';
export function settlementReversalJournal(amountMinor,provider){
 if(!Number.isSafeInteger(amountMinor)||amountMinor<=0)throw new Error('Invalid reversal amount');
 const account=provider==='paystack'?chart.paystack:provider==='mpesa'?chart.mpesa:null;
 if(!account)throw new Error('Unsupported payment provider');
 return balanced([
  {account:chart.ar.code,name:chart.ar.name,debit:amountMinor,credit:0},
  {account:account.code,name:account.name,debit:0,credit:amountMinor},
 ],'Verified customer payment reversal');
}
export function validateConfirmedReversal(allocation,settlement,verification){
 if(allocation?.reversalStatus==='reversed')return {alreadyReversed:true};
 if(settlement?.disputeState!=='frozen'||!allocation||!settlement)
  throw new Error('Settlement freeze and allocation required');
 if(verification?.status!=='confirmed'||verification.providerReference!==settlement.providerReference||
 !['refund','chargeback'].includes(verification.kind)||
 !Number.isSafeInteger(verification.amountMinor)||verification.amountMinor!==allocation.amountMinor)
  throw new Error('Independent provider confirmation required');
 if(!['paystack_api','daraja_api'].includes(verification.source))
  throw new Error('Unsupported confirmation source');
 return {alreadyReversed:false,amountMinor:verification.amountMinor,
  journal:settlementReversalJournal(verification.amountMinor,settlement.provider)};
}
