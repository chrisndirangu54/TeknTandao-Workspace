const stages=['qualification','discovery','proposal','negotiation','won','lost'];
const transitions={qualification:['discovery','lost'],discovery:['proposal','lost'],proposal:['negotiation','won','lost'],negotiation:['won','lost'],won:[],lost:[]};
const bounded=(v,max)=>typeof v==='string'&&v.trim()&&v.length<=max?v.trim():null;
export function crmOpportunity(input){
 const title=bounded(input?.title,160),contactId=bounded(input?.contactId,140);
 const amountMinor=input?.amountMinor;
 const probability=input?.probability??10;
 if(!title||!contactId||!Number.isSafeInteger(amountMinor)||amountMinor<0||amountMinor>1e12||
  !Number.isInteger(probability)||probability<0||probability>100)
  throw new Error('Invalid opportunity fields');
 const dueDate=input?.expectedCloseDate;
 if(typeof dueDate!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(dueDate)||
  Number.isNaN(Date.parse(dueDate+'T00:00:00Z'))||
  new Date(dueDate+'T00:00:00Z').toISOString().slice(0,10)!==dueDate)
  throw new Error('Valid expected close date required');
 return {title,contactId,amountMinor,probability,expectedCloseDate:dueDate,
  stage:'qualification',status:'open'};
}
export function crmAdvanceOpportunity(current,next,reason){
 if(!transitions[current?.stage]?.includes(next))throw new Error('Invalid opportunity stage transition');
 if(next==='lost'&&!bounded(reason,1000))throw new Error('Loss reason required');
 return {stage:next,status:['won','lost'].includes(next)?'closed':'open',
  probability:next==='won'?100:next==='lost'?0:current.probability,
  closedReason:next==='lost'?reason.trim():null};
}
export function crmFollowUp(input){
 const title=bounded(input?.title,160),ownerUid=bounded(input?.ownerUid,140);
 const dueAt=input?.dueAt;
 if(!title||!ownerUid||typeof dueAt!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(dueAt)||
  Number.isNaN(Date.parse(dueAt)))throw new Error('Invalid follow-up');
 return {title,ownerUid,dueAt,status:'open'};
}
export function crmPipelineSummary(rows){
 const result=Object.fromEntries(stages.map(s=>[s,{count:0,amountMinor:0,weightedMinor:0}]));
 for(const row of rows){
  const slot=result[row.stage];
  if(!slot||!Number.isSafeInteger(row.amountMinor)||row.amountMinor<0||
   !Number.isInteger(row.probability)||row.probability<0||row.probability>100)continue;
  slot.count++;slot.amountMinor+=row.amountMinor;
  slot.weightedMinor+=Math.round(row.amountMinor*row.probability/100);
 }
 return result;
}
