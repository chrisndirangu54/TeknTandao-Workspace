import test from 'node:test';
import assert from 'node:assert/strict';
import {reconcileHotspotMpesa,allowedHotspotOrderTransition,hotspotPaymentGate} from '../src/hotspot_payment_domain.js';
const order={id:'order_0001',voucherId:'voucher_01',planId:'plan_001',siteId:'site_001',amountKes:100,merchantAccount:'TESTPAYBILL',checkoutRequestId:'checkout_001',status:'pending_verification'};
const provider={CheckoutRequestID:order.checkoutRequestId,ResultCode:0};
const receipt={source:'verified_provider',checkoutRequestId:order.checkoutRequestId,receiptNumber:'ABC12345',merchantAccount:'TESTPAYBILL',amountKes:100,orderId:order.id};
test('server payment reconciliation requires matching checkout receipt merchant and amount',()=>{
 assert.equal(reconcileHotspotMpesa({order,provider,receipt}).verified,true);
 assert.equal(reconcileHotspotMpesa({order,provider,receipt:{...receipt,amountKes:99}}).reason,'amount_mismatch');
 assert.equal(reconcileHotspotMpesa({order,provider,receipt:{...receipt,source:'browser'}}).verified,false);
 assert.equal(reconcileHotspotMpesa({order,provider:{...provider,ResultCode:1032},receipt}).verified,false);
});
test('payment transitions cannot return a failed or refunded order to verified',()=>{
 assert.equal(allowedHotspotOrderTransition('failed','verified'),false);
 assert.equal(allowedHotspotOrderTransition('refunded','verified'),false);
 assert.equal(allowedHotspotOrderTransition('pending_verification','verified'),true);
});
test('payment-gate rejects mismatched voucher and price',()=>{
 const verified={...order,status:'verified',receiptVerified:true,providerVerifiedAt:'2026-11-06T00:00:00Z'};
 const plan={id:order.planId,priceKes:100};
 const voucher={id:order.voucherId,siteId:order.siteId};
 assert.equal(hotspotPaymentGate({order:verified,plan,voucher}).allowed,true);
 assert.equal(hotspotPaymentGate({order:verified,plan:{...plan,priceKes:101},voucher}).allowed,false);
 assert.equal(hotspotPaymentGate({order:{...verified,receiptVerified:false},plan,voucher}).allowed,false);
});
