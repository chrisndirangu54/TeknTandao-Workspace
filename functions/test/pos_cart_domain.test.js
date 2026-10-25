import test from 'node:test';
import assert from 'node:assert/strict';
import {validatePosCart,pricePosCart} from '../src/pos_cart_domain.js';
import {posReceipt} from '../src/pos_receipts_domain.js';

test('prices a two-line cart using server prices and computes receipt',()=>{
 const items=validatePosCart([{productId:'rice',quantity:2},{productId:'milk',quantity:3}]);
 const priced=pricePosCart(items,new Map([
  ['rice',{name:'Rice',stock:10,price:12000}],
  ['milk',{name:'Milk',stock:10,price:2000}]
 ]));
 assert.equal(priced.total,30000);
 const receipt=posReceipt({kind:'pos_cart',currency:'KES',paymentState:'unpaid',lines:priced.lines,total:priced.total},'test123');
 assert.equal(receipt.lines.length,2);
 assert.equal(receipt.taxInvoice,false);
 assert.equal(receipt.paid,false);
});
test('rejects duplicate products and insufficient stock before posting',()=>{
 assert.throws(()=>validatePosCart([{productId:'rice',quantity:1},{productId:'rice',quantity:1}]),/Duplicate/);
 const items=validatePosCart([{productId:'rice',quantity:4}]);
 assert.throws(()=>pricePosCart(items,new Map([['rice',{name:'Rice',stock:3,price:1000}]])),/Insufficient/);
});
