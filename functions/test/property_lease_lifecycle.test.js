import test from 'node:test';
import assert from 'node:assert/strict';
import {validateLease,renewLease,terminateLease} from '../src/property_leases_domain.js';
const current={...validateLease({propertyId:'u1',tenantId:'t1',startDate:'2026-01-01',endDate:'2027-01-01',monthlyRentMinor:1000000}),leaseId:'lease1'};
test('renewal must extend an active lease with a positive rent',()=>{
 assert.deepEqual(renewLease(current,{newEndDate:'2027-12-31',newMonthlyRentMinor:1200000}),{endDate:'2027-12-31',monthlyRentMinor:1200000});
 assert.throws(()=>renewLease(current,{newEndDate:'2026-12-31',newMonthlyRentMinor:1200000}),/extend/);
 assert.throws(()=>renewLease(current,{newEndDate:'2027-12-31',newMonthlyRentMinor:0}),/positive/);
 assert.throws(()=>renewLease({...current,status:'terminated'},{newEndDate:'2027-12-31',newMonthlyRentMinor:1200000}),/active/);
});
test('termination cannot precede tenancy, overrun term or lack a reason',()=>{
 assert.deepEqual(terminateLease(current,{terminationDate:'2026-09-30',reason:' Mutual notice '}),{status:'terminated',endDate:'2026-09-30',terminationReason:'Mutual notice'});
 assert.throws(()=>terminateLease(current,{terminationDate:'2025-12-31',reason:'Notice'}),/outside/);
 assert.throws(()=>terminateLease(current,{terminationDate:'2026-09-30',reason:' '}),/reason/);
});
