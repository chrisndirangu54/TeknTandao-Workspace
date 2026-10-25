import test from 'node:test';
import assert from 'node:assert/strict';
import {validateLease,leaseOverlaps,rentCharge} from '../src/property_leases_domain.js';
const base={propertyId:'unitA',tenantId:'tenantA',startDate:'2026-01-01',endDate:'2027-01-01',monthlyRentMinor:2500000,depositMinor:2500000};
test('lease validates valid dates and positive rent',()=>{
 const lease=validateLease(base);
 assert.equal(lease.monthlyRentMinor,2500000);
 assert.throws(()=>validateLease({...base,startDate:'2026-02-30'}),/date/);
 assert.throws(()=>validateLease({...base,monthlyRentMinor:0}),/positive/);
 assert.throws(()=>validateLease({...base,endDate:'2025-01-01'}),/follow/);
});
test('existing active leases overlap but adjacent periods do not',()=>{
 const lease=validateLease(base);
 assert.equal(leaseOverlaps(lease,[{...lease,startDate:'2026-12-01',endDate:'2027-02-01'}]),true);
 assert.equal(leaseOverlaps(lease,[{...lease,startDate:'2027-01-01',endDate:'2028-01-01'}]),false);
});
test('rent charges are full-month, unpaid and tied to effective lease',()=>{
 const lease={...validateLease(base),leaseId:'lease1'};
 const charge=rentCharge(lease,'2026-04');
 assert.equal(charge.paymentState,'unpaid');
 assert.equal(charge.amountMinor,2500000);
 assert.throws(()=>rentCharge(lease,'2027-04'),/not effective/);
 assert.throws(()=>rentCharge(lease,'2026-13'),/period/);
});
