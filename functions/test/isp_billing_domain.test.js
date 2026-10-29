import test from 'node:test';
import assert from 'node:assert/strict';
import {draftIspInvoice,prepareIspPaymentEvidence} from '../src/isp_billing_domain.js';
test('invoice totals use integer minor units without granting service',()=>{
 const invoice=draftIspInvoice({subscriberId:'cust_1',planId:'fiber20',priceMinorKes:250000,period:'2026-10',reference:'invoice_1'});
 assert.equal(invoice.totalMinor,250000);
 assert.equal(invoice.paymentStatus,'unverified');
 assert.equal(invoice.serviceEntitlementChanged,false);
 assert.throws(()=>draftIspInvoice({subscriberId:'cust_1',planId:'fiber20',priceMinorKes:2500.5,period:'2026-10',reference:'invoice_1'}));
 assert.throws(()=>draftIspInvoice({subscriberId:'cust_1',planId:'fiber20',priceMinorKes:250000,period:'2026-13',reference:'invoice_1'}));
});
test('unverified M-Pesa evidence cannot mark invoice paid or activate access',()=>{
 const receipt=prepareIspPaymentEvidence({invoiceId:'invoice_1',reference:'MPESA123',provider:'mpesa',amountMinor:250000});
 assert.equal(receipt.verified,false);
 assert.equal(receipt.canActivateService,false);
 assert.equal(receipt.status,'awaiting_provider_verification');
 assert.throws(()=>prepareIspPaymentEvidence({invoiceId:'invoice_1',reference:'MPESA123',provider:'mpesa',amountMinor:-250000}));
});
