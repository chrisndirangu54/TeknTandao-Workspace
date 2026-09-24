import {money} from './domain.js';

export const chart = Object.freeze({
  ar: {code: '1100', name: 'Accounts receivable'},
  mpesa: {code: '1120', name: 'M-Pesa clearing'},
  paystack: {code: '1130', name: 'Paystack clearing'},
  revenue: {code: '4000', name: 'Revenue'},
  salary: {code: '6100', name: 'Salary expense'},
  paye: {code: '2100', name: 'PAYE payable'},
  nssf: {code: '2110', name: 'NSSF payable'},
  shif: {code: '2120', name: 'SHIF payable'},
  housing: {code: '2130', name: 'Housing levy payable'},
  netPay: {code: '2140', name: 'Net pay payable'},
});

function line(account, debit, credit) {
  if (!account?.code) throw new Error('Unknown ledger account');
  if ((!debit && !credit) || (debit > 0 && credit > 0)) throw new Error('A journal line is either a debit or a credit');
  return {account: account.code, name: account.name, debit: money(debit || 0), credit: money(credit || 0)};
}

export function balanced(lines, memo) {
  if (!Array.isArray(lines) || lines.length < 2) throw new Error('A journal entry needs at least two lines');
  const totalDebit = lines.reduce((sum, item) => sum + item.debit, 0);
  const totalCredit = lines.reduce((sum, item) => sum + item.credit, 0);
  if (totalDebit !== totalCredit || totalDebit <= 0) throw new Error('Journal entry must balance');
  return {currency: 'KES', memo, total: totalDebit, lines};
}

export function invoiceJournal(totalMinor) {
  const total = money(totalMinor);
  return balanced([line(chart.ar, total, 0), line(chart.revenue, 0, total)], 'Customer invoice');
}

export function creditJournal(totalMinor) {
  const total = money(totalMinor);
  return balanced([line(chart.revenue, total, 0), line(chart.ar, 0, total)], 'Credit note');
}

export function paymentJournal(totalMinor, provider) {
  const total = money(totalMinor);
  const clearing = provider === 'mpesa' ? chart.mpesa : provider === 'paystack' ? chart.paystack : null;
  if (!clearing) throw new Error('Unsupported settlement account');
  return balanced([line(clearing, total, 0), line(chart.ar, 0, total)], 'Customer payment');
}

export function payrollJournal(slip) {
  const rows = [
    [chart.salary, slip.employerCostMinor, 0],
    [chart.netPay, 0, slip.netMinor],
    [chart.paye, 0, slip.payeMinor],
    [chart.nssf, 0, slip.nssfEmployeeMinor + slip.nssfEmployerMinor],
    [chart.shif, 0, slip.shifMinor],
    [chart.housing, 0, slip.housingEmployeeMinor + slip.housingEmployerMinor],
  ].filter(([, debit, credit]) => debit > 0 || credit > 0).map(([account, debit, credit]) => line(account, debit, credit));
  return balanced(rows, `Payroll ${slip.period}`);
}

export function trialBalance(journals) {
  const totals = new Map();
  for (const journal of journals) {
    if (journal.currency !== 'KES' || !Array.isArray(journal.lines)) throw new Error('Invalid journal');
    for (const item of journal.lines) {
      const current = totals.get(item.account) || {account: item.account, name: item.name, debit: 0, credit: 0};
      current.debit += item.debit;
      current.credit += item.credit;
      totals.set(item.account, current);
    }
  }
  const rows = [...totals.values()].map(row => ({...row, balance: row.debit - row.credit})).sort((a, b) => a.account.localeCompare(b.account));
  const net = rows.reduce((sum, row) => sum + row.balance, 0);
  if (net !== 0) throw new Error('Trial balance is out of balance');
  return {currency: 'KES', rows, journalCount: journals.length};
}
