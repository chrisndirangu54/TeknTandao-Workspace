import {identifier,money} from './domain.js';
function day(value){
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value)||
  !Number.isFinite(Date.parse(value+'T00:00:00Z'))||
  new Date(value+'T00:00:00Z').toISOString().slice(0,10)!==value)
  throw new Error('Invalid lease date');
 return value;
}
export function validateLease({propertyId,tenantId,startDate,endDate,monthlyRentMinor,depositMinor=0}){
 const start=day(startDate),end=day(endDate);
 if(start>=end)throw new Error('Lease end must follow start');
 const rent=money(monthlyRentMinor),deposit=money(depositMinor);
 if(!rent)throw new Error('Monthly rent must be positive');
 return {propertyId:identifier(propertyId),tenantId:identifier(tenantId),
  startDate:start,endDate:end,monthlyRentMinor:rent,depositMinor:deposit,currency:'KES',status:'active'};
}
export function leaseOverlaps(proposed,active){
 return active.some(lease=>lease.status==='active'&&
  proposed.startDate<lease.endDate&&proposed.endDate>lease.startDate);
}
export function rentCharge(lease,period){
 if(typeof period!=='string'||!/^\d{4}-(0[1-9]|1[0-2])$/.test(period))
  throw new Error('Invalid rent period');
 const first=period+'-01',last=new Date(Date.UTC(+period.slice(0,4),+period.slice(5,7),0)).toISOString().slice(0,10);
 if(lease.status!=='active'||lease.startDate>last||lease.endDate<=first)
  throw new Error('Lease not effective during rent period');
 return {leaseId:lease.leaseId,propertyId:lease.propertyId,tenantId:lease.tenantId,
  period,amountMinor:lease.monthlyRentMinor,currency:'KES',paymentState:'unpaid',
  pricingPolicy:'full_month_no_proration'};
}
