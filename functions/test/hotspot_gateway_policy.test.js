import test from 'node:test';
import assert from 'node:assert/strict';
import {authorizedGatewayGrant,summarizeRadiusSessions,validateRouterosCredentialPlan} from '../src/hotspot_gateway_policy.js';
const site={id:'site_10001',status:'active',routerConnected:true,gatewayVerified:true};
const plan={id:'plan_10001',siteId:site.id,status:'active',priceKes:50,durationMinutes:60,downloadMbps:10,uploadMbps:2,maxDevices:1};
const voucher={id:'vouch_10001',siteId:site.id,planId:plan.id,status:'issued',redeemed:false};
const payment={voucherId:voucher.id,siteId:site.id,planId:plan.id,status:'verified',receiptVerified:true,expectedAmountKes:50};
test('verified gateway and matched payment required',()=>{
 assert.equal(authorizedGatewayGrant({voucher,plan,site,payment}).allowed,true);
 assert.equal(authorizedGatewayGrant({voucher,plan,site:{...site,gatewayVerified:false},payment}).allowed,false);
 assert.equal(authorizedGatewayGrant({voucher,plan,site,payment:{...payment,expectedAmountKes:49}}).reason,'payment_not_verified');
 assert.equal(authorizedGatewayGrant({voucher:{...voucher,status:'unissued'},plan,site,payment}).allowed,false);
 assert.equal(authorizedGatewayGrant({voucher,plan:{...plan,siteId:'site_99999'},site,payment}).reason,'site_plan_mismatch');
});
test('independent operator approval before gateway preflight',()=>{
 assert.equal(validateRouterosCredentialPlan({voucher,plan,site,payment,operatorApproved:false}).ready,false);
 assert.equal(validateRouterosCredentialPlan({voucher,plan,site,payment,operatorApproved:true}).executed,false);
});
test('aggregate only the most recent cumulative counters for each session',()=>{
 const events=[
 {siteId:site.id,sessionId:'sess_10001',type:'start',observedAtMs:10,inputOctets:0,outputOctets:0},
 {siteId:site.id,sessionId:'sess_10001',type:'interim',observedAtMs:20,inputOctets:600,outputOctets:1000},
 {siteId:site.id,sessionId:'sess_10001',type:'stop',observedAtMs:30,inputOctets:900,outputOctets:1200},
 {siteId:site.id,sessionId:'sess_10002',type:'interim',observedAtMs:25,inputOctets:100,outputOctets:200}];
 const sum=summarizeRadiusSessions(events);
 assert.equal(sum.latestInboundBytes,1000);
 assert.equal(sum.latestOutboundBytes,1400);
 assert.equal(sum.sampledSessions,2);
});
