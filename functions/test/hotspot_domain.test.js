import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {hotspotVoucherEligibility,radiusReplyPlan,normalizeRadiusAccounting,verifyCollectorSignature,radiusProfileForMikrotik} from '../src/hotspot_domain.js';
const site={id:'site_10001',status:'active'};
const plan={id:'plan_10001',status:'active',priceKes:50,durationMinutes:60,downloadMbps:10,uploadMbps:2,maxDevices:1};
const voucher={siteId:site.id,planId:plan.id,status:'unissued',redeemed:false};
test('paid plan fails closed without verified payment',()=>assert.equal(hotspotVoucherEligibility({voucher,site,plan}).reason,'unverified_payment'));
test('revoked voucher fails closed',()=>assert.equal(hotspotVoucherEligibility({voucher:{...voucher,status:'revoked'},site,plan,paid:true}).eligible,false));
test('policy passing does not imply provisioning',()=>assert.equal(hotspotVoucherEligibility({voucher,site,plan,paid:true}).reason,'policy_passed_not_provisioned'));
test('RADIUS timeout and rate orientation are deterministic',()=>{assert.equal(radiusReplyPlan(plan).sessionTimeoutSeconds,3600);assert.equal(radiusProfileForMikrotik({username:'user_10001',profile:plan}).attributes['Mikrotik-Rate-Limit'],'2000k/10000k');});
test('rejects malformed and stale accounting events',()=>assert.throws(()=>normalizeRadiusAccounting({eventId:'evt_10001',siteId:site.id,sessionId:'ses_10001',usernameRef:'user_10001',nasId:'nas_10001',type:'interim',inputOctets:-1,outputOctets:2,observedAtMs:Date.now()})));
test('signed accounting requires matching key and body',()=>{const raw='{"eventId":"evt_10001"}';const secret='test-secret';const signature=createHmac('sha256',secret).update(raw).digest('hex');assert.equal(verifyCollectorSignature(raw,signature,secret),true);assert.equal(verifyCollectorSignature(raw+' ',signature,secret),false);});

test('unknown voucher states never grant access',()=>assert.equal(hotspotVoucherEligibility({voucher:{...voucher,status:'pending'},site,plan,paid:true}).eligible,false));
