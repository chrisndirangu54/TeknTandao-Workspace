const allowed=new Set(['email','whatsapp','call']);
export function crmSuppression(input){
 if(!allowed.has(input?.channel)&&input?.channel!=='all')throw new Error('Invalid suppression channel');
 if(typeof input.reason!=='string'||!input.reason.trim()||input.reason.length>500)throw new Error('Suppression reason required');
 return {channel:input.channel,reason:input.reason.trim(),status:'suppressed'};
}
export function allowedCrmContact(contact,suppressions,channel){
 if(!allowed.has(channel))throw new Error('Invalid channel');
 if(contact?.doNotContact===true||contact?.optedOut===true)return false;
 return !suppressions.some(s=>s.status==='suppressed'&&(s.channel===channel||s.channel==='all'));
}
export function appendCrmSequenceStep(template,step){
 if(template?.status!=='draft')throw new Error('Draft sequence required');
 if(!Array.isArray(template.steps)||template.steps.length>=8)throw new Error('Sequence step limit reached');
 if(!allowed.has(step?.channel)||!Number.isInteger(step?.delayDays)||step.delayDays<0||step.delayDays>90||
  typeof step.body!=='string'||!step.body.trim()||step.body.length>2000||
  typeof (step.subject??'Follow-up')!=='string'||(step.subject??'Follow-up').length>180)
  throw new Error('Invalid sequence step');
 return {steps:[...template.steps,{channel:step.channel,delayDays:step.delayDays,
  subject:(step.subject||'Follow-up').trim(),body:step.body.trim()}]};
}
