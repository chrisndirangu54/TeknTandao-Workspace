import {money} from './domain.js';
export function tillReconciliation(openingMinor,movements,closingMinor){
 const opening=money(openingMinor),closing=money(closingMinor);
 if(!Array.isArray(movements)||movements.length>1000)throw new Error('Invalid till movements');
 let net=0;
 for(const m of movements){
  if(!['cash_in','cash_out'].includes(m.type))throw new Error('Invalid till movement type');
  const amount=money(m.amountMinor);
  if(amount<=0)throw new Error('Till movement must be positive');
  net+=m.type==='cash_in'?amount:-amount;
 }
 const expected=opening+net,difference=closing-expected;
 if(!Number.isSafeInteger(expected)||!Number.isSafeInteger(difference))throw new Error('Till balance overflow');
 return {currency:'KES',openingMinor:opening,netMovementsMinor:net,expectedMinor:expected,countedMinor:closing,differenceMinor:difference,balanced:difference===0};
}
