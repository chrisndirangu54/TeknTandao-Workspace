import {money} from './domain.js';

// Only allocations backed by explicitly verified payment records reduce arrears.
// There is deliberately no client-supplied "paid" toggle.
export function propertyTenantStatement(charges,allocations,{asOf}={}){
 if(!Array.isArray(charges)||!Array.isArray(allocations))throw new Error('Invalid statement inputs');
 if(charges.length>500||allocations.length>1000)throw new Error('Statement exceeds reporting bounds');
 if(typeof asOf!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(asOf)||
   new Date(asOf+'T00:00:00Z').toISOString().slice(0,10)!==asOf)
  throw new Error('Invalid as-of date');
 const rows=charges.map(c=>{
  const due=money(c.amountMinor);
  if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(c.period))throw new Error('Invalid charge period');
  return {chargeId:c.chargeId,period:c.period,amountMinor:due,verifiedPaidMinor:0};
 });
 const map=new Map(rows.map(r=>[r.chargeId,r]));
 if(map.size!==rows.length)throw new Error('Duplicate charge in statement');
 const seen=new Set();
 for(const entry of allocations){
  if(!entry.verified||!entry.paymentId||!entry.allocationId)
    throw new Error('Unverified or untraceable payment allocation');
  if(seen.has(entry.allocationId))throw new Error('Duplicate allocation');
  seen.add(entry.allocationId);
  const row=map.get(entry.chargeId);
  if(!row)throw new Error('Allocation references an unknown charge');
  row.verifiedPaidMinor+=money(entry.amountMinor);
  if(row.verifiedPaidMinor>row.amountMinor)throw new Error('Overallocated rent charge');
 }
 let totalDueMinor=0,totalVerifiedPaidMinor=0,arrearsMinor=0;
 for(const row of rows){
  row.outstandingMinor=row.amountMinor-row.verifiedPaidMinor;
  row.overdue=row.outstandingMinor>0 && row.period+'-01'<asOf.slice(0,7)+'-01';
  totalDueMinor+=row.amountMinor;totalVerifiedPaidMinor+=row.verifiedPaidMinor;
  if(row.overdue)arrearsMinor+=row.outstandingMinor;
 }
 if(![totalDueMinor,totalVerifiedPaidMinor,arrearsMinor].every(Number.isSafeInteger))
  throw new Error('Statement total exceeds safe integer');
 return {currency:'KES',asOf,rows,totalDueMinor,totalVerifiedPaidMinor,
  outstandingMinor:totalDueMinor-totalVerifiedPaidMinor,arrearsMinor,
  note:'Only authenticated verified payment allocations reduce balances; not a bank settlement certificate.'};
}
