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

export function periodFinancialStatements(journals,{fromDate,toDate}={}) {
  const valid=date=>typeof date==='string' && /^\d{4}-\d{2}-\d{2}$/.test(date) &&
    Number.isFinite(Date.parse(date+'T00:00:00Z')) &&
    new Date(date+'T00:00:00Z').toISOString().slice(0,10)===date;
  if(!valid(fromDate)||!valid(toDate)||fromDate>toDate)throw new Error('Valid report date range required');
  if(!Array.isArray(journals))throw new Error('Journals must be an array');
  // Validate all source entries and disallow undated legacy records in this report.
  trialBalance(journals);
  for(const journal of journals)if(!valid(journal.postingDate))
    throw new Error('Undated journal prevents reliable period statements');
  const toDateJournals=journals.filter(j=>j.postingDate<=toDate);
  const inPeriod=toDateJournals.filter(j=>j.postingDate>=fromDate);
  const cumulative=provisionalFinancialStatements(toDateJournals);
  const period=provisionalFinancialStatements(inPeriod);
  return {currency:'KES',provisional:true,fromDate,toDate,asOf:toDate,
    profitAndLoss:period.profitAndLoss,
    balanceSheet:cumulative.balanceSheet,
    periodJournalCount:inPeriod.length,cumulativeJournalCount:toDateJournals.length,
    warnings:[...new Set([...cumulative.warnings,
      'Balance sheet is cumulative through report end; profit and loss is for the selected date range.',
      'Opening balances, closing entries, and historical journal completeness must be verified.'])]};
}
