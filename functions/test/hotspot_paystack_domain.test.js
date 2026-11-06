import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {validatePaystackMpesaResult} from '../src/hotspot_paystack_domain.js';
const email='test@example.com';
const order={provider:'paystack_mpesa_test',state:'pending_verification',
 reference:'HSaabbcc123456',amountKes:50,customerEmailHash:createHash('sha256').update(email).digest('hex')};
const result={domain:'test',status:'success',channel:'mobile_money',
 reference:order.reference,amount:5000,currency:'KES',id:12345678,
 paid_at:'2026-11-06T06:00:00.000Z',customer:{email}};
test('accept only independently verified test M-Pesa transaction',()=>{
 assert.equal(validatePaystackMpesaResult({order,result}).verified,true);
 assert.equal(validatePaystackMpesaResult({order,result:{...result,domain:'live'}}).verified,false);
 assert.equal(validatePaystackMpesaResult({order,result:{...result,amount:4999}}).verified,false);
 assert.equal(validatePaystackMpesaResult({order,result:{...result,currency:'GHS'}}).verified,false);
 assert.equal(validatePaystackMpesaResult({order,result:{...result,channel:'card'}}).verified,false);
 assert.equal(validatePaystackMpesaResult({order,result:{...result,customer:{email:'other@example.com'}}}).verified,false);
 assert.equal(validatePaystackMpesaResult({order,result:{...result,reference:'not-the-order'}}).verified,false);
});
