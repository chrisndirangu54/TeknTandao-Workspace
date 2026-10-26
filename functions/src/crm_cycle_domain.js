const stages=['qualification','discovery','proposal','negotiation','won','lost'];
const millis=v=>typeof v==='string'?Date.parse(v):v?.seconds!=null?v.seconds*1000:NaN;
export function crmSalesCycleReport(deals,histories,period){
 if(typeof period!=='string'||!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)||!Array.isArray(deals)||deals.length>200)throw new Error('Invalid sales cycle report');
 const closed=deals.filter(d=>['won','lost'].includes(d.stage)&&typeof d.closedAt==='string'&&d.closedAt.slice(0,7)===period);
 const durations=[];
 const transitions=Object.fromEntries(stages.map(s=>[s,Object.fromEntries(stages.map(t=>[t,0]))]));
 let incomplete=0;
 for(const deal of closed){
  const created=millis(deal.createdAt),ended=millis(deal.closedAt);
  if(Number.isFinite(created)&&Number.isFinite(ended)&&ended>=created)durations.push(Math.round((ended-created)/86400000));
  else incomplete++;
  const events=histories[deal.id];
  if(!Array.isArray(events)||!events.length){incomplete++;continue;}
  for(const event of events){
   if(stages.includes(event.from)&&stages.includes(event.to)&&event.from!==event.to)
    transitions[event.from][event.to]++;
  }
 }
 return {period,closedDeals:closed.length,measuredSalesCycles:durations.length,
  averageDaysToClose:durations.length?Math.round(durations.reduce((a,b)=>a+b,0)/durations.length):null,
  unknownEvidenceCount:incomplete,transitions,
  note:'Observed recorded transitions in closed deals only; not cohort conversion probabilities.'};
}
