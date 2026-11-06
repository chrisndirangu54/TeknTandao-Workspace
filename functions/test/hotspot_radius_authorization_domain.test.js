import test from 'node:test';import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {evaluateRadiusAccess,verifySignedRadiusRequest} from '../src/hotspot_radius_authorization_domain.js';
const site={id:'site_00001',state:'commissioned',gatewayVerified:true,radiusEnabled:true};
const plan={id:'plan_00001',siteId:site.id,state:'published',priceKes:50,durationMinutes:60,uploadMbps:2,downloadMbps:10};
const code='A'.repeat(32),salt='b'.repeat(32);
const secretHash=createHmac('sha256',Buffer.from(salt,'hex')).update(code).digest('hex');
const voucher={id:'vouch_00001',siteId:site.id,planId:plan.id,state:'provisioned',gatewayProvisioned:true,redeemed:false,secretSalt:salt,secretHash,expiresAtMs:Date.now()+3600000};
const payment={state:'verified',receiptVerified:true,providerVerifiedAt:'2026-11-06',voucherId:voucher.id,planId:plan.id,siteId:site.id,amountKes:50};
test('RADIUS admission requires payment, gateway, code and published plan',()=>{
 assert.equal(evaluateRadiusAccess({site,plan,voucher,payment,providedCode:code}).authorized,true);
 assert.equal(evaluateRadiusAccess({site:{...site,gatewayVerified:false},plan,voucher,payment,providedCode:code}).authorized,false);
 assert.equal(evaluateRadiusAccess({site,plan,voucher,payment:null,providedCode:code}).authorized,false);
 assert.equal(evaluateRadiusAccess({site,plan,voucher,payment,providedCode:'B'.repeat(32)}).authorized,false);
 assert.equal(evaluateRadiusAccess({site,plan,voucher:{...voucher,state:'revoked'},payment,providedCode:code}).authorized,false);
});
test('RADIUS HMAC ties signed body to timestamp',()=>{
 const raw=Buffer.from('{"nonce":"TEST12345"}'),ts=String(Date.now()),secret='gateway-private-key';
 const sig=createHmac('sha256',secret).update(ts).update('.').update(raw).digest('hex');
 assert.equal(verifySignedRadiusRequest({raw,timestamp:ts,signature:sig,secret}),true);
 assert.equal(verifySignedRadiusRequest({raw:Buffer.from('changed'),timestamp:ts,signature:sig,secret}),false);
 assert.equal(verifySignedRadiusRequest({raw,timestamp:String(Date.now()-120000),signature:sig,secret}),false);
});
