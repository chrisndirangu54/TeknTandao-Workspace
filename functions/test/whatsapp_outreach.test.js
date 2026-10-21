import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizePhone,validateLead,makeClickToChat,outreachMessage,mayAutomateSend} from '../src/whatsapp_outreach.js';
test('phone numbers are strictly normalized and validated', () => {
  assert.equal(normalizePhone('+254 711 161 164'), '+254711161164');
  assert.throws(() => normalizePhone('0711161164'));
});
test('lead requires sourceable contact and explicit consent status', () => {
  const lead=validateLead({organization:'Example Clinic',phone:'+254711161164',sourceUrl:'https://example.org'});
  assert.equal(lead.consentStatus,'unverified');
  assert.equal(mayAutomateSend(lead),false);
  assert.equal(mayAutomateSend({...lead,consentStatus:'opted_in'}),true);
  assert.equal(mayAutomateSend({...lead,consentStatus:'opted_in',suppressed:true}),false);
});
test('click-to-chat encodes text but does not send', () => {
  const url=makeClickToChat('+254 711 161 164','Hello & welcome');
  assert.equal(url,'https://wa.me/254711161164?text=Hello%20%26%20welcome');
  assert.match(outreachMessage({organization:'Example Clinic'}), /TeknTandao Workspace/);
});
