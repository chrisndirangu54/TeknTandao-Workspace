// Employer-configured leave rules, not legal entitlement calculations.
export function validateLeavePolicy(input){
 const weekendDays=input?.weekendDays??[0,6];
 const holidays=input?.holidays??[];
 const annualAllowanceDays=input?.annualAllowanceDays;
 if(!Array.isArray(weekendDays)||weekendDays.some(d=>!Number.isInteger(d)||d<0||d>6)||new Set(weekendDays).size!==weekendDays.length)
  throw new Error('Invalid weekend policy');
 if(!Array.isArray(holidays)||holidays.length>100||holidays.some(d=>typeof d!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(d)||new Date(d+'T00:00:00Z').toISOString().slice(0,10)!==d))
  throw new Error('Invalid holiday policy');
 if(!Number.isInteger(annualAllowanceDays)||annualAllowanceDays<0||annualAllowanceDays>365)
  throw new Error('Invalid annual allowance');
 return {weekendDays,holidays:[...new Set(holidays)],annualAllowanceDays};
}
export function chargeableLeaveDays(leave,policy){
 const validated=validateLeavePolicy(policy);
 let days=0;
 for(let time=Date.parse(leave.startDate+'T00:00:00Z');time<=Date.parse(leave.endDate+'T00:00:00Z');time+=86400000){
  const date=new Date(time);
  if(!validated.weekendDays.includes(date.getUTCDay())&&!validated.holidays.includes(date.toISOString().slice(0,10)))days++;
 }
 return days;
}
export function availableAnnualLeave({allowanceDays,approvedDays,requestedDays}){
 if(![allowanceDays,approvedDays,requestedDays].every(v=>Number.isInteger(v)&&v>=0))
  throw new Error('Invalid leave balance');
 if(approvedDays+requestedDays>allowanceDays)throw new Error('Insufficient annual leave balance');
 return allowanceDays-approvedDays-requestedDays;
}
