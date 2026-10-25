import {trialBalance} from './ledger_domain.js';

// Provisional statements only: excludes fiscal adjustments, inventory costing,
// depreciation and tax configuration until those ledgers are integrated.
export function provisionalFinancialStatements(journals) {
  const trial=trialBalance(journals);
  const sections={assets:[],liabilities:[],equity:[],income:[],expenses:[],unclassified:[]};
  for(const row of trial.rows){
    const type=row.account[0];
    const section=type==='1'?'assets':type==='2'?'liabilities':type==='3'?'equity':
      type==='4'?'income':type==='5'||type==='6'?'expenses':'unclassified';
    sections[section].push({...row,amountMinor:section==='liabilities'||section==='equity'||section==='income'?-row.balance:row.balance});
  }
  const sum=rows=>rows.reduce((total,row)=>total+row.amountMinor,0);
  const revenueMinor=sum(sections.income);
  const expensesMinor=sum(sections.expenses);
  const profitMinor=revenueMinor-expensesMinor;
  const assetsMinor=sum(sections.assets);
  const liabilitiesMinor=sum(sections.liabilities);
  const equityMinor=sum(sections.equity);
  return {currency:'KES',provisional:true,journalCount:trial.journalCount,sections,
    profitAndLoss:{revenueMinor,expensesMinor,profitMinor},
    balanceSheet:{assetsMinor,liabilitiesMinor,equityMinor,unclosedProfitMinor:profitMinor,
      differenceMinor:assetsMinor-liabilitiesMinor-equityMinor-profitMinor},
    warnings:['Provisional report: chart mapping and closing adjustments require review',
      ...(sections.unclassified.length?['Unclassified ledger accounts exist']:[])]};
}
