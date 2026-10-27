import test from 'node:test';
import assert from 'node:assert/strict';
import {financeAgentSummary} from '../src/finance_agent_domain.js';

test('reports outstanding and overdue invoice balances without claiming cash received',()=>{
 const report=financeAgentSummary([
  {id:'a',contactId:'c',currency:'KES',total:10000,allocatedMinor:4000,dueDate:'2026-10-01'},
  {id:'b',contactId:'c',currency:'KES',total:3000,allocatedMinor:3000,dueDate:'2026-09-01'},
  {id:'c',contactId:'d',currency:'KES',total:5000,allocatedMinor:0,dueDate:'2026-12-01'},
 ],[{code:'missing_payment_journal',allocationId:'p'}],'2026-10-27T00:00:00Z');
 assert.equal(report.totalOutstandingMinor,11000);
 assert.equal(report.overdueMinor,6000);
 assert.equal(report.outstandingInvoiceCount,2);
 assert.equal(report.discrepancyCount,1);
 assert.equal(report.readOnly,true);
});
test('rejects invalid amounts and does not invent balances',()=>{
 const r=financeAgentSummary([
  {id:'bad',total:100,allocatedMinor:200},
  {id:'foreign',currency:'USD',total:200,allocatedMinor:0}
 ],[],'2026-10-27T00:00:00Z');
 assert.equal(r.totalOutstandingMinor,0);
 assert.equal(r.warnings.length,2);
});
test('fails closed on non-bounded datasets',()=>{
 assert.throws(()=>financeAgentSummary(Array(501).fill({id:'a'}),[]),/Invalid/);
});
