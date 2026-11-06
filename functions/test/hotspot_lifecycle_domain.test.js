import test from 'node:test';import assert from 'node:assert/strict';
import {decideVoucherTransition,normalizeGatewayReceipt} from '../src/hotspot_lifecycle_domain.js';
const site={id:'site_00001',state:'commissioned',gatewayVerified:true};
const plan={id:'plan_00001',siteId:site.id,state:'published',priceKes:100};
const voucher={id:'vouch_00001',siteId:site.id,planId:plan.id,state:'pending_payment'};
const payment={state:'verified',receiptVerified:true,verifiedAt:'2026-11-06T05:00:00Z',voucherId:voucher.id,siteId:site.id,planId:plan.id,amountKes:100};
test('paid voucher cannot issue on a failed or mismatched settlement',()=>{
 assert.equal(decideVoucherTransition({voucher,target:'issued',plan,site,payment:null}).allowed,false);
 assert.equal(decideVoucherTransition({voucher,target:'issued',plan,site,payment:{...payment,amountKes:99}}).allowed,false);
 assert.equal(decideVoucherTransition({voucher,target:'issued',plan,site,payment}).allowed,true);
});
test('provision requires distinct approver and verified site',()=>{
 const issued={...voucher,state:'issued'};
 assert.equal(decideVoucherTransition({voucher:issued,target:'provision_pending',plan,site,approvedBy:'owner',actorUid:'owner'}).allowed,false);
 assert.equal(decideVoucherTransition({voucher:issued,target:'provision_pending',plan,site:{...site,gatewayVerified:false},approvedBy:'reviewer',actorUid:'owner'}).allowed,false);
 assert.equal(decideVoucherTransition({voucher:issued,target:'provision_pending',plan,site,approvedBy:'reviewer',actorUid:'owner'}).allowed,true);
});
test('record transitions never fabricate a gateway ack',()=>{
 assert.equal(decideVoucherTransition({voucher:{...voucher,state:'provision_pending'},target:'provisioned',plan,site,approvedBy:'reviewer',actorUid:'owner'}).allowed,false);
 assert.equal(decideVoucherTransition({voucher:{...voucher,state:'provisioned'},target:'active',plan,site,approvedBy:'reviewer',actorUid:'owner'}).allowed,false);
});
test('reject forged gateway receipts and stale timestamps',()=>{
 const req={id:'req_00001',voucherId:voucher.id,siteId:site.id,operation:'disconnect',state:'pending'};
 const receipt={requestId:req.id,voucherId:voucher.id,siteId:site.id,operation:'disconnect',status:'acknowledged',attestedBy:'trusted_gateway',observedAtMs:Date.now()};
 assert.equal(normalizeGatewayReceipt({request:req,receipt}).verified,true);
 assert.equal(normalizeGatewayReceipt({request:req,receipt:{...receipt,attestedBy:'browser'}}).verified,false);
 assert.equal(normalizeGatewayReceipt({request:req,receipt:{...receipt,observedAtMs:1}}).verified,false);
});
