import test from 'node:test';
import assert from 'node:assert/strict';
import {buildPosSaleSnapshot,posReceipt} from '../src/pos_receipts_domain.js';
const snapshot=buildPosSaleSnapshot({saleId:'sale1',productId:'sku1',productName:'Rice',contactId:'cust1',quantity:2,unitPriceMinor:12500,totalMinor:25000,warehouseId:'main'});
test('locks receipt values to checkout rather than live catalogue price',()=>{
 const receipt=posReceipt({productId:'sku1',quantity:2,total:25000,currency:'KES',paymentState:'unpaid',receiptSnapshot:snapshot},'sale1');
 assert.equal(receipt.productName,'Rice');
 assert.equal(receipt.totalMinor,25000);
 assert.equal(receipt.paid,false);
 assert.equal(receipt.taxInvoice,false);
});
test('rejects mismatched totals and fabricated settlement',()=>{
 assert.throws(()=>buildPosSaleSnapshot({...snapshot,totalMinor:20000}),/mismatch/);
 assert.throws(()=>posReceipt({productId:'sku1',quantity:2,total:25000,currency:'KES',paymentState:'paid',receiptSnapshot:snapshot},'sale1'),/Unverified/);
});
