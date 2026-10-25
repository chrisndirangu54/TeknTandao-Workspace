import {identifier,money} from './domain.js';
const day = value => {
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value)||Number.isNaN(Date.parse(value+'T00:00:00Z')))
    throw new Error('Invalid ISO date');
  return Math.floor(Date.parse(value+'T00:00:00Z')/86400000);
};
export function supplierPayablesAging(bills,asOf){
  if(!Array.isArray(bills)||bills.length>500)throw new Error('Bounded bill list required');
  const today=day(asOf);
  const buckets={current:0,days1to30:0,days31to60:0,days61to90:0,over90:0};
  const rows=[];
  for(const bill of bills){
    const id=identifier(bill.id);
    if(bill.accountingState!=='posted')continue;
    const total=money(bill.totalMinor),settled=money(bill.settledMinor||0);
    if(settled>total)throw new Error('Settlements exceed payable');
    const outstanding=total-settled;
    const daysPastDue=Math.max(0,today-day(bill.dueDate));
    const bucket=daysPastDue===0?'current':daysPastDue<=30?'days1to30':daysPastDue<=60?'days31to60':daysPastDue<=90?'days61to90':'over90';
    buckets[bucket]+=outstanding;
    rows.push({id,supplierId:identifier(bill.supplierId),outstandingMinor:outstanding,daysPastDue,bucket});
  }
  return {asOf,currency:'KES',buckets,rows,totalOutstandingMinor:Object.values(buckets).reduce((a,b)=>a+b,0)};
}
