const channels=['email','whatsapp','call'];
const validText=(v,max)=>typeof v==='string'&&v.trim().length>0&&v.length<=max;
export function sequencePlan(input){
 if(!validText(input?.name,120)||!Array.isArray(input?.steps)||input.steps.length<1||input.steps.length>8)throw new Error('Invalid sequence template');
 const steps=input.steps.map((step,index)=>{
  if(!channels.includes(step?.channel)||!Number.isInteger(step.delayDays)||step.delayDays<0||step.delayDays>90||
    !validText(step.subject||'Follow-up',180)||!validText(step.body,2000))throw new Error('Invalid sequence step '+index);
  return {channel:step.channel,delayDays:step.delayDays,subject:(step.subject||'Follow-up').trim(),body:step.body.trim()};
 });
 return {name:input.name.trim(),steps,status:'draft',automaticSending:false};
}
export function sequenceEnrollment(template,contact,channel,consent,now){
 if(template?.status!=='active')throw new Error('Active sequence required');
 if(!channels.includes(channel)||!template.steps.some(s=>s.channel===channel))throw new Error('Channel not in sequence');
 if(consent?.channel!==channel||consent?.granted!==true||!validText(consent?.evidence,500))
  throw new Error('Documented channel-specific consent required');
 if(!contact||contact.doNotContact===true||contact.optedOut===true)
  throw new Error('Contact opted out');
 const timestamp=Date.parse(now);
 if(!Number.isFinite(timestamp))throw new Error('Invalid enrollment time');
 return {status:'active',channel,consentEvidence:consent.evidence.trim(),enrolledAt:new Date(timestamp).toISOString(),nextStep:0,automaticSending:false};
}
export function stopSequence(enrollment,reason){
 if(enrollment?.status!=='active'||!validText(reason,500))throw new Error('Active enrollment and stop reason required');
 return {status:'stopped',stopReason:reason.trim()};
}
