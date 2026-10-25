import test from 'node:test';
import assert from 'node:assert/strict';
import {propertyTenantStatement} from '../src/property_statements_domain.js';
const charges=[{chargeId:'l1_2026-08',period:'2026-08',amountMinor:2000000},
 {chargeId:'l1_2026-09',period:'2026-09',amountMinor:2000000}];
test('statement shows unpaid arrears without assuming successful payments',()=>{
 const result=propertyTenantStatement(charges,[],{asOf:'2026-10-25'});
 assert.equal(result.totalDueMinor,4000000);
 assert.equal(result.arrearsMinor,4000000);
 assert.equal(result.totalVerifiedPaidMinor,0);
});
test('verified allocations reduce outstanding but not beyond invoice amount',()=>{
 const entry={allocationId:'a1',paymentId:'p1',chargeId:'l1_2026-08',amountMinor:500000,verified:true};
 const result=propertyTenantStatement(charges,[entry],{asOf:'2026-10-25'});
 assert.equal(result.outstandingMinor,3500000);
 assert.throws(()=>propertyTenantStatement(charges,[{...entry,verified:false}],{asOf:'2026-10-25'}),/Unverified/);
 assert.throws(()=>propertyTenantStatement(charges,[entry,entry],{asOf:'2026-10-25'}),/Duplicate allocation/);
 assert.throws(()=>propertyTenantStatement(charges,[{...entry,amountMinor:3000000}],{asOf:'2026-10-25'}),/Overallocated/);
});
