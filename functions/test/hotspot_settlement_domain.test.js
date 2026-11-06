import test from 'node:test';
import assert from 'node:assert/strict';
import {parseStkCallback,evaluateSettlementEvidence} from '../src/hotspot_settlement_domain.js';
const id='ws_CO_12345678';
const body={Body:{stkCallback:{CheckoutRequestID:id,ResultCode:0,CallbackMetadata:{Item:[
 {Name:'Amount',Value:50},{Name:'MpesaReceiptNumber',Value:'SJK1234567'},{Name:'PhoneNumber',Value:254712345678}
]}}}};
test('parse valid callback, never assume authenticity',()=>{
 const x=parseStkCallback(body);assert.equal(x.valid,true);assert.equal(x.trusted,false);assert.equal(x.amountKes,50);
});
test('reject malformed success callbacks and duplicate metadata',()=>{
 assert.equal(parseStkCallback({Body:{stkCallback:{CheckoutRequestID:id,ResultCode:0}}}).valid,false);
 assert.equal(parseStkCallback({Body:{stkCallback:{...body.Body.stkCallback,
 CallbackMetadata:{Item:[{Name:'Amount',Value:50},{Name:'Amount',Value:50}]}}}}).valid,false);
});
test('callback and successful provider query cannot authenticate settlement alone',()=>{
 const callback=parseStkCallback(body),order={checkoutRequestId:id,amountKes:50,merchantAccount:'TEST'};
 const providerQuery={ResultCode:0};
 assert.equal(evaluateSettlementEvidence({order,callback,providerQuery}).settled,false);
 assert.equal(evaluateSettlementEvidence({order,callback,providerQuery}).reason,'independent_receipt_verification_required');
 assert.equal(evaluateSettlementEvidence({order,callback,providerQuery,officialStatement:{authenticatedSource:'independent_provider_statement',
 checkoutId:id,receipt:callback.receipt,amountKes:49,merchantAccount:'TEST'}}).settled,false);
});
