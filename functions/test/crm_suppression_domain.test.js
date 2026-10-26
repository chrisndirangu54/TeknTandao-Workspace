import test from 'node:test';
import assert from 'node:assert/strict';
import {crmSuppression,allowedCrmContact,appendCrmSequenceStep} from '../src/crm_suppression_domain.js';
test('channel opt-outs prevent sequence enrollment eligibility',()=>{
 const suppression=crmSuppression({channel:'whatsapp',reason:'Customer withdrew consent'});
 assert.equal(allowedCrmContact({},[suppression],'whatsapp'),false);
 assert.equal(allowedCrmContact({},[suppression],'email'),true);
 assert.equal(allowedCrmContact({doNotContact:true},[],'email'),false);
 assert.throws(()=>crmSuppression({channel:'sms',reason:'Stop'}),/channel/);
});
test('draft sequences can be edited up to eight steps',()=>{
 const draft={status:'draft',steps:[{channel:'email',delayDays:0,subject:'First',body:'Hello'}]};
 const updated=appendCrmSequenceStep(draft,{channel:'call',delayDays:3,body:'Follow-up'});
 assert.equal(updated.steps.length,2);
 assert.equal(draft.steps.length,1);
 assert.throws(()=>appendCrmSequenceStep({...draft,status:'active'},{channel:'call',delayDays:3,body:'Hi'}),/Draft/);
 assert.throws(()=>appendCrmSequenceStep({...draft,steps:Array(8).fill(draft.steps[0])},{channel:'call',delayDays:3,body:'Hi'}),/limit/);
});
