export function scoreCrmLead(contact, opportunities=[], followUps=[], now='2026-10-26T00:00:00Z'){
 if(!contact||typeof contact!=='object')throw new Error('Contact required');
 const id=contact.id;
 if(typeof id!=='string'||!id)throw new Error('Contact identifier required');
 if(!Number.isFinite(Date.parse(now)))throw new Error('Invalid clock');
 let score=0;
 const reasons=[];
 const add=(points,reason)=>{score+=points;reasons.push({points,reason});};
 if(typeof contact.email==='string'&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact.email.trim()))add(15,'Contact email available');
 if(typeof contact.phone==='string'&&contact.phone.trim().length>=7)add(10,'Phone available');
 if(typeof contact.location==='string'&&contact.location.trim())add(5,'Location available');
 const deals=opportunities.filter(d=>d.contactId===id);
 const active=deals.filter(d=>d.status==='open');
 if(active.length)add(20,'Active opportunity');
 if(active.some(d=>['proposal','negotiation'].includes(d.stage)))add(25,'Advanced opportunity stage');
 if(deals.some(d=>d.stage==='won'))add(15,'Previously won opportunity');
 const ids=new Set(active.map(d=>d.id));
 const tasks=followUps.filter(t=>ids.has(t.opportunityId)&&t.status==='open');
 if(tasks.some(t=>typeof t.dueAt==='string'&&Date.parse(t.dueAt)>=Date.parse(now)))add(10,'Upcoming follow-up scheduled');
 const overdue=tasks.some(t=>typeof t.dueAt==='string'&&Date.parse(t.dueAt)<Date.parse(now));
 if(overdue){score=Math.max(0,score-10);reasons.push({points:-10,reason:'Overdue follow-up'});}
 score=Math.min(100,score);
 return {contactId:id,score,band:score>=70?'hot':score>=35?'warm':'cold',
  reasons,method:'explainable-rule-based',predictive:false};
}
export function rankCrmLeads(contacts,deals,tasks,now){
 if(!Array.isArray(contacts)||contacts.length>200||!Array.isArray(deals)||!Array.isArray(tasks))throw new Error('CRM scoring limit exceeded');
 return contacts.map(c=>scoreCrmLead(c,deals,tasks,now)).sort((a,b)=>b.score-a.score||a.contactId.localeCompare(b.contactId));
}
