import {identifier,money} from './domain.js';
import {balanced} from './ledger_domain.js';
export function depreciationSchedule({assetId,costMinor,residualMinor=0,lifeMonths,startMonth}){
 identifier(assetId);
 const cost=money(costMinor),residual=money(residualMinor);
 if(residual>=cost)throw new Error('Residual value must be below cost');
 if(!Number.isSafeInteger(lifeMonths)||lifeMonths<1||lifeMonths>600)throw new Error('Invalid useful life');
 if(typeof startMonth!=='string'||!/^\d{4}-(0[1-9]|1[0-2])$/.test(startMonth))throw new Error('Invalid start month');
 const depreciable=cost-residual,base=Math.floor(depreciable/lifeMonths),remainder=depreciable%lifeMonths;
 const [year,month]=startMonth.split('-').map(Number);
 return Array.from({length:lifeMonths},(_,i)=>{
   const date=new Date(Date.UTC(year,month-1+i,1));
   const period=date.toISOString().slice(0,7);
   const expenseMinor=base+(i<remainder?1:0);
   return {period,expenseMinor};
 });
}
export function depreciationJournal(expenseMinor){
 const amount=money(expenseMinor);
 if(!amount)throw new Error('Zero depreciation is not postable');
 return balanced([
   {account:'6300',name:'Depreciation expense',debit:amount,credit:0},
   {account:'1590',name:'Accumulated depreciation',debit:0,credit:amount}
 ],'Monthly straight-line depreciation');
}

export function planAssetDisposal({costMinor,accumulatedMinor,proceedsMinor=0}){
 const cost=money(costMinor),accumulated=money(accumulatedMinor),proceeds=money(proceedsMinor);
 if(!cost||accumulated>cost)throw new Error('Invalid asset accumulated depreciation');
 const bookValueMinor=cost-accumulated;
 const gainMinor=Math.max(0,proceeds-bookValueMinor);
 const lossMinor=Math.max(0,bookValueMinor-proceeds);
 const lines=[
  {account:'1590',name:'Accumulated depreciation',debit:accumulated,credit:0},
  {account:'1500',name:'Fixed assets at cost',debit:0,credit:cost}
 ];
 if(proceeds)lines.push({account:'1000',name:'Cash',debit:proceeds,credit:0});
 if(gainMinor)lines.push({account:'4900',name:'Gain on disposal',debit:0,credit:gainMinor});
 if(lossMinor)lines.push({account:'6900',name:'Loss on disposal',debit:lossMinor,credit:0});
 return {bookValueMinor,gainMinor,lossMinor,journal:balanced(lines,'Fixed asset disposal')};
}
