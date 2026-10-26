import {validateLeaveLedger} from './hr_leave_ledger_domain.js';

export function validateAccrualPolicy(input){
 const monthlyDays=input?.monthlyDays,carryoverCapDays=input?.carryoverCapDays;
 if(!Number.isInteger(monthlyDays)||monthlyDays<0||monthlyDays>31||
    !Number.isInteger(carryoverCapDays)||carryoverCapDays<0||carryoverCapDays>365)
  throw new Error('Invalid accrual or carryover policy');
 return {monthlyDays,carryoverCapDays};
}
export function accrueAnnualLeave(balance,policy,period){
 const config=validateAccrualPolicy(policy);
 if(typeof period!=='string'||!/^\d{4}-(0[1-9]|1[0-2])$/.test(period))
  throw new Error('Invalid accrual period');
 if(period.slice(0,4)!==balance.year)throw new Error('Accrual outside entitlement year');
 const current=validateLeaveLedger(balance);
 const granted=balance.grantedDays+config.monthlyDays;
 if(!Number.isSafeInteger(granted)||granted>10000)throw new Error('Accrual exceeds safe entitlement');
 return {grantedDays:granted,usedDays:balance.usedDays,remainingDays:current+config.monthlyDays,days:config.monthlyDays};
}
export function carryForwardLeave(prior,next,policy){
 const config=validateAccrualPolicy(policy);
 const unused=validateLeaveLedger(prior);
 validateLeaveLedger(next);
 if(+next.year!==+prior.year+1)throw new Error('Carryover years must be consecutive');
 const days=Math.min(unused,config.carryoverCapDays);
 if(next.grantedDays+days>10000)throw new Error('Carryover exceeds safe entitlement');
 return {days,grantedDays:next.grantedDays+days,usedDays:next.usedDays};
}
