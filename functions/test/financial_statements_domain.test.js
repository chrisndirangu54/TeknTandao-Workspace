import test from 'node:test';
import assert from 'node:assert/strict';
import {provisionalFinancialStatements} from '../src/financial_statements_domain.js';
import {invoiceJournal,supplierBillJournal} from '../src/ledger_domain.js';
test('trial-balance-based statements reconcile assets to liabilities and profit',()=>{
 const r=provisionalFinancialStatements([invoiceJournal(1000),supplierBillJournal(300)]);
 assert.equal(r.profitAndLoss.profitMinor,1000);
 assert.equal(r.balanceSheet.assetsMinor,1300);
 assert.equal(r.balanceSheet.liabilitiesMinor,300);
 assert.equal(r.balanceSheet.differenceMinor,0);
 assert.equal(r.provisional,true);
});
