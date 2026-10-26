import test from 'node:test';
import assert from 'node:assert/strict';
import {sequencePlan,sequenceEnrollment,stopSequence} from '../src/crm_sequences_domain.js';
const template=sequencePlan({name:'Welcome',steps:[{channel:'email',delayDays:2,subject:'Hello',body:'Thanks for your interest'}]});
test('sequence template validates bounded manual steps',()=>{
 assert.equal(template.status,'draft');
 assert.equal(template.automaticSending,false);
 assert.throws(()=>sequencePlan({name:'Broken',steps:[]}),/Invalid/);
 assert.throws(()=>sequencePlan({name:'Bad',steps:[{channel:'telegram',delayDays:0,body:'Hello'}]}),/Invalid/);
});
test('enrollment needs active template, channel consent and contact not opted out',()=>{
 const active={...template,status:'active'};
 const consent={channel:'email',granted:true,evidence:'Contact opted in via signed form'};
 const result=sequenceEnrollment(active,{name:'Customer'},'email',consent,'2026-10-26T08:00:00Z');
 assert.equal(result.status,'active');
 assert.equal(result.automaticSending,false);
 assert.throws(()=>sequenceEnrollment(template,{},'email',consent,'2026-10-26T08:00:00Z'),/Active/);
 assert.throws(()=>sequenceEnrollment(active,{},'email',{...consent,granted:false},'2026-10-26T08:00:00Z'),/consent/);
 assert.throws(()=>sequenceEnrollment(active,{doNotContact:true},'email',consent,'2026-10-26T08:00:00Z'),/opted out/);
});
test('stopping sequence requires a reason',()=>{
 assert.equal(stopSequence({status:'active'},'Customer requested unsubscribe').status,'stopped');
 assert.throws(()=>stopSequence({status:'stopped'},'Again'),/Active/);
});
