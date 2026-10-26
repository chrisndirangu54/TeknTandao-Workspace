import test from 'node:test';
import assert from 'node:assert/strict';
import {customerSettlementAllocation} from '../src/customer_settlement_transaction_domain.js';
const invoice={contactId:'c1',currency:'KES',total:10000,allocatedMinor:3000};
const settlement={contactId:'c1',currency:'KES',amountMinor:8000,allocatedMinor:1000,
 verificationStatus:'verified',trustBoundary:'provider_webhook_verified',verificationSource:'daraja_api'};
test('keeps invoice and verified settlement allocation balances consistent',()=>{
 const result=customerSettlementAllocation(invoice,settlement,5000);
 assert.deepEqual(result,{allocatedMinor:5000,invoiceAllocatedMinor:8000,
  settlementAllocatedMinor:6000,invoiceOutstandingMinor:2000,settlementAvailableMinor:2000});
});
test('rejects overpayment or double usage across multiple invoices',()=>{
 assert.throws(()=>customerSettlementAllocation(invoice,settlement,7001),/exceeds/);
 assert.throws(()=>customerSettlementAllocation({...invoice,total:5000},settlement,3000),/exceeds/);
});
test('requires a trusted verified provider record and customer match',()=>{
 assert.throws(()=>customerSettlementAllocation(invoice,{...settlement,trustBoundary:'user_reported'},100),/Trusted/);
 assert.throws(()=>customerSettlementAllocation(invoice,{...settlement,verificationSource:'manual'},100),/Supported/);
 assert.throws(()=>customerSettlementAllocation(invoice,{...settlement,contactId:'other'},100),/mismatch/);
});
