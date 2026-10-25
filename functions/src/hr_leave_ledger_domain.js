export function leaveYear(date){
 if(typeof date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date+'T00:00:00Z'))||new Date(date+'T00:00:00Z').toISOString().slice(0,10)!==date)throw new Error('Invalid leave year date');
 return date.slice(0,4);
}
export function validateLeaveLedger(balance){
 if(!balance||!Number.isSafeInteger(balance.grantedDays)||balance.grantedDays<0||!Number.isSafeInteger(balance.usedDays)||balance.usedDays<0||balance.usedDays>balance.grantedDays)
  throw new Error('Invalid leave entitlement ledger');
 return balance.grantedDays-balance.usedDays;
}
export function consumeLeave(balance,days){
 const available=validateLeaveLedger(balance);
 if(!Number.isSafeInteger(days)||days<1||days>366)throw new Error('Invalid chargeable leave days');
 if(days>available)throw new Error('Insufficient leave entitlement');
 return {grantedDays:balance.grantedDays,usedDays:balance.usedDays+days,remainingDays:available-days};
}
