import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizePhone,validateLead,validateWorkspaceSender,mayConfigureSender,makeClickToChat,outreachMessage,mayAutomateSend} from '../src/whatsapp_outreach.js';
test('phone numbers are strictly validated',()=>{
 assert.equal(normalizePhone('+254 711 161 164'),'+254711161164');
 assert.throws(()=>normalizePhone('0711161164'));
});
test('workspace sender defaults to disabled and unverified',()=>{
 const sender=validateWorkspaceSender({workspaceId:'tenant_a',displayName:'Demo Farm',phone:'+254711161164'});
 assert.equal(sender.sendingEnabled,false); assert.equal(sender.verificationStatus,'unverified');
 assert.equal(mayConfigureSender({workspaceId:'tenant_a',role:'admin'},'tenant_a'),true);
 assert.equal(mayConfigureSender({workspaceId:'tenant_b',role:'admin'},'tenant_a'),false);
 assert.equal(mayConfigureSender({workspaceId:'tenant_a',role:'member'},'tenant_a'),false);
});
test('outreach template uses tenant identity rather than platform founder',()=>{
 const message=outreachMessage({organization:'Example Clinic',senderName:'Demo Farm'});
 assert.match(message,/Demo Farm/);
 assert.doesNotMatch(message,/Chris Mwangi|254180590803/);
});
test('sending requires opt-in, tenant match and verified sender',()=>{
 const sender={workspaceId:'tenant_a',verificationStatus:'verified',sendingEnabled:true};
 const lead={workspaceId:'tenant_a',consentStatus:'opted_in'};
 assert.equal(mayAutomateSend(lead,sender),true);
 assert.equal(mayAutomateSend({...lead,workspaceId:'tenant_b'},sender),false);
 assert.equal(mayAutomateSend({...lead,consentStatus:'unverified'},sender),false);
 assert.equal(mayAutomateSend(lead,{...sender,sendingEnabled:false}),false);
 assert.equal(mayAutomateSend({...lead,suppressed:true},sender),false);
});
test('manual click-to-chat creates a URL, not a send',()=>{
 assert.equal(makeClickToChat('+254711161164','Hello & welcome'),'https://wa.me/254711161164?text=Hello%20%26%20welcome');
});
