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
