import {money} from './domain.js';
export function verifiedRentPayment(payment,amountMinor){
 const amount=money(amountMinor);
 if(!amount)throw new Error('Allocation must be positive');
 if(!payment||payment.verificationStatus!=='verified'||payment.settlementStatus!=='settled'||
   payment.currency!=='KES'||!Number.isSafeInteger(payment.amountMinor))
  throw new Error('Independent verified and settled payment required');
 if(payment.amountMinor<amount)throw new Error('Allocation exceeds payment');
 return amount;
}
export function availableRentAllocation(payment,allocations,newAmount){
 const amount=verifiedRentPayment(payment,newAmount);
 const allocated=allocations.reduce((sum,a)=>sum+money(a.amountMinor),0);
 if(!Number.isSafeInteger(allocated+amount)||allocated+amount>payment.amountMinor)
  throw new Error('Payment has insufficient unallocated balance');
 return amount;
}
