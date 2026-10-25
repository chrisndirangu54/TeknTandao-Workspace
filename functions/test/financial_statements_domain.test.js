import test from 'node:test';
import assert from 'node:assert/strict';
import {provisionalFinancialStatements,periodFinancialStatements} from '../src/financial_statements_domain.js';
import {invoiceJournal,supplierBillJournal} from '../src/ledger_domain.js';
test('trial-balance-based statements reconcile assets to liabilities and profit',()=>{
 const r=provisionalFinancialStatements([invoiceJournal(1000),supplierBillJournal(300)]);
 assert.equal(r.profitAndLoss.profitMinor,1000);
 assert.equal(r.balanceSheet.assetsMinor,1300);
 assert.equal(r.balanceSheet.liabilitiesMinor,300);
 assert.equal(r.balanceSheet.differenceMinor,0);
 assert.equal(r.provisional,true);
});

test('period reporting separates monthly income from cumulative balance sheet',()=>{
 const old={...invoiceJournal(2000),postingDate:'2026-09-15'};
 const current={...invoiceJournal(1000),postingDate:'2026-10-15'};
 const result=periodFinancialStatements([old,current],{fromDate:'2026-10-01',toDate:'2026-10-31'});
 assert.equal(result.profitAndLoss.profitMinor,1000);
 assert.equal(result.balanceSheet.assetsMinor,3000);
 assert.equal(result.periodJournalCount,1);
 assert.equal(result.balanceSheet.differenceMinor,0);
});
test('period statements reject missing or malformed journal posting dates',()=>{
 assert.throws(()=>periodFinancialStatements([invoiceJournal(100)],{fromDate:'2026-10-01',toDate:'2026-10-31'}),/Undated journal/);
 assert.throws(()=>periodFinancialStatements([],{fromDate:'2026-02-30',toDate:'2026-10-31'}),/Valid report date range/);
});
