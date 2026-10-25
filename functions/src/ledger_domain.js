import {money} from './domain.js';

export const chart = Object.freeze({
  ar: {code: '1100', name: 'Accounts receivable'},
  inventory: {code: '1200', name: 'Inventory asset'},
  ap: {code: '2200', name: 'Accounts payable'},
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

export function supplierBillJournal(totalMinor) {
  const total = money(totalMinor);
  return balanced([line(chart.inventory, total, 0), line(chart.ap, 0, total)], 'Supplier bill for received inventory');
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
  if (!Array.isArray(journals)) throw new Error('Journals must be an array');
  for (const journal of journals) {
    if (!journal || journal.currency !== 'KES' || !Array.isArray(journal.lines) || journal.lines.length < 2) {
      throw new Error('Invalid journal');
    }
    let debitTotal = 0;
    let creditTotal = 0;
    for (const item of journal.lines) {
      if (!item || typeof item.account !== 'string' || !/^\d{4}$/.test(item.account) ||
          typeof item.name !== 'string' || !item.name.trim()) throw new Error('Invalid journal account');
      const debit = money(item.debit);
      const credit = money(item.credit);
      if ((debit === 0 && credit === 0) || (debit > 0 && credit > 0)) {
        throw new Error('Invalid journal line: exactly one side must be positive');
      }
      debitTotal += debit;
      creditTotal += credit;
      if (!Number.isSafeInteger(debitTotal) || !Number.isSafeInteger(creditTotal)) {
        throw new Error('Journal total exceeds safe integer range');
      }
      const current = totals.get(item.account) || {account: item.account, name: item.name, debit: 0, credit: 0};
      current.debit += debit;
      current.credit += credit;
      if (!Number.isSafeInteger(current.debit) || !Number.isSafeInteger(current.credit)) {
        throw new Error('Ledger total exceeds safe integer range');
      }
      totals.set(item.account, current);
    }
    if (debitTotal === 0 || debitTotal !== creditTotal) throw new Error('Journal entry must balance');
  }
  const rows = [...totals.values()].map(row => ({...row, balance: row.debit - row.credit})).sort((a, b) => a.account.localeCompare(b.account));
  const net = rows.reduce((sum, row) => sum + row.balance, 0);
  if (net !== 0) throw new Error('Trial balance is out of balance');
  return {currency: 'KES', rows, journalCount: journals.length};
}
