import test from 'node:test';
import assert from 'node:assert/strict';
import {verifiedRentPayment,availableRentAllocation} from '../src/property_payments_domain.js';
const payment={verificationStatus:'verified',settlementStatus:'settled',currency:'KES',amountMinor:2000000};
test('allocations require independently verified and settled payments',()=>{
 assert.equal(verifiedRentPayment(payment,100000),100000);
 assert.throws(()=>verifiedRentPayment({...payment,verificationStatus:'pending'},100000),/verified/);
 assert.throws(()=>verifiedRentPayment({...payment,settlementStatus:'pending'},100000),/settled/);
});
test('payment cannot be allocated beyond settled amount',()=>{
 assert.equal(availableRentAllocation(payment,[{amountMinor:750000}],1250000),1250000);
 assert.throws(()=>availableRentAllocation(payment,[{amountMinor:750000}],1250001),/insufficient/);
 assert.throws(()=>availableRentAllocation(payment,[],0),/positive/);
});
