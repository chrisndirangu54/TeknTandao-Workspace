import test from 'node:test';
import assert from 'node:assert/strict';
import {supplierPayablesAging} from '../src/payables_aging_domain.js';
test('supplier aging partitions outstanding amounts by due date',()=>{
 const a=supplierPayablesAging([{id:'b1',supplierId:'s1',accountingState:'posted',totalMinor:10000,settledMinor:2000,dueDate:'2026-09-01'},
 {id:'b2',supplierId:'s1',accountingState:'posted',totalMinor:1000,dueDate:'2026-11-01'}],'2026-10-25');
 assert.equal(a.totalOutstandingMinor,9000);
 assert.equal(a.buckets.days31to60,8000);
 assert.equal(a.buckets.current,1000);
});
test('supplier aging rejects overpaid invoices and invalid due dates',()=>{
 assert.throws(()=>supplierPayablesAging([{id:'b',supplierId:'s',accountingState:'posted',totalMinor:1,settledMinor:2,dueDate:'2026-10-25'}],'2026-10-25'),/exceed/);
});
