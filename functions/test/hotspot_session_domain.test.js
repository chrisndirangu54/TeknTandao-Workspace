import test from 'node:test';import assert from 'node:assert/strict';
import {normalizeV2Session,sessionKey} from '../src/hotspot_session_domain.js';
const now=Date.now(),base={orgId:'org_00001',siteId:'site_00001',nasId:'nas_00001',
 voucherId:'vouch_00001',sessionId:'sess_00001',eventId:'evt_00001',
 type:'start',observedAtMs:now,inputOctets:0,outputOctets:0,nonce:'nonce_0001'};
test('accounting must validate identifiers and counter bounds',()=>{
 assert.equal(normalizeV2Session(base,now).source,'signed_radius_bridge');
 assert.throws(()=>normalizeV2Session({...base,inputOctets:-1},now));
 assert.throws(()=>normalizeV2Session({...base,observedAtMs:now-600000},now));
 assert.throws(()=>normalizeV2Session({...base,source:'user'},now));
});
test('session scope includes site and voucher',()=>{
 assert.equal(sessionKey(base),'site_00001__vouch_00001__sess_00001');
});
