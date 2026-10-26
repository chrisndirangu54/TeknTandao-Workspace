const types=new Set(['call','meeting','email','whatsapp','note']);
export function crmActivity(input){
 const type=input?.type,summary=input?.summary,occurredAt=input?.occurredAt;
 if(!types.has(type))throw new Error('Unsupported interaction type');
 if(typeof summary!=='string'||!summary.trim()||summary.length>2000)throw new Error('Interaction summary required');
 if(typeof occurredAt!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(occurredAt)||
  Number.isNaN(Date.parse(occurredAt))||new Date(occurredAt).toISOString().replace('.000','')!==occurredAt)
  throw new Error('Invalid activity timestamp');
 return {type,summary:summary.trim(),occurredAt,source:'manual',status:'logged'};
}
export function crmActivityTimeline(rows){
 if(!Array.isArray(rows)||rows.length>200)throw new Error('Timeline limit exceeded');
 return [...rows].sort((a,b)=>b.occurredAt.localeCompare(a.occurredAt)||a.id.localeCompare(b.id));
}
