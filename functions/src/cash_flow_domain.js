import {trialBalance} from './ledger_domain.js';

// Cash-flow movements are inferred only from explicitly categorized cash/bank
// account lines. Unclassified counterpart accounts make the result provisional.
const cashAccounts=new Set(['1000','1010','1020']);
export function provisionalCashFlow(journals){
  trialBalance(journals);
  const sections={operatingMinor:0,investingMinor:0,financingMinor:0,unclassifiedMinor:0};
  let cashMovementMinor=0;
  for(const journal of journals){
    const cashLines=journal.lines.filter(x=>cashAccounts.has(x.account));
    if(!cashLines.length)continue;
    const cashChange=cashLines.reduce((sum,x)=>sum+x.debit-x.credit,0);
    cashMovementMinor+=cashChange;
    const counterpart=journal.lines.filter(x=>!cashAccounts.has(x.account));
    const classifications=new Set(counterpart.map(x=>
      x.account.startsWith('3')?'financingMinor':
      x.account.startsWith('15')||x.account.startsWith('16')?'investingMinor':
      ['1','2','4','5','6'].includes(x.account[0])?'operatingMinor':'unclassifiedMinor'));
    const classification=classifications.size===1?[...classifications][0]:'unclassifiedMinor';
    sections[classification]+=cashChange;
  }
  return {currency:'KES',provisional:true,sections,cashMovementMinor,
    reconciles:cashMovementMinor===Object.values(sections).reduce((a,b)=>a+b,0),
    warnings:['Provisional cash movements only; indirect cash flow, opening balances, restricted cash and account classifications require review.'],
    recognizedCashAccounts:[...cashAccounts]};
}
