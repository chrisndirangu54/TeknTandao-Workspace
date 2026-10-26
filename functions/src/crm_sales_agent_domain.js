const terminal=new Set(['won','lost']);
const validDate=value=>typeof value==='string'&&Number.isFinite(Date.parse(value));
export function crmSalesRecommendations(opportunities,followUps,now=new Date().toISOString(),limit=25){
 if(!Array.isArray(opportunities)||!Array.isArray(followUps)||opportunities.length>500||followUps.length>500||
 !validDate(now)||!Number.isInteger(limit)||limit<1||limit>100)throw new Error('Invalid CRM recommendation input');
 const today=Date.parse(now);
 const active=new Map();
 for(const f of followUps){
  if(f.status==='open'&&typeof f.opportunityId==='string'){
   const group=active.get(f.opportunityId)||[];
   group.push(f);
   active.set(f.opportunityId,group);
  }
 }
 const recommendations=[];
 for(const opportunity of opportunities){
  if(!opportunity?.id||terminal.has(opportunity.stage)||opportunity.status==='closed')continue;
  const actions=active.get(opportunity.id)||[];
  const overdue=actions.filter(f=>validDate(f.dueAt)&&Date.parse(f.dueAt)<today);
  const next=actions.filter(f=>validDate(f.dueAt)).sort((a,b)=>Date.parse(a.dueAt)-Date.parse(b.dueAt))[0];
  const entered=validDate(opportunity.stageEnteredAt)?Math.max(0,Math.floor((today-Date.parse(opportunity.stageEnteredAt))/86400000)):null;
  const closing=validDate(opportunity.expectedCloseDate)?Math.floor((Date.parse(opportunity.expectedCloseDate+'T23:59:59Z')-today)/86400000):null;
  const reasons=[];
  if(overdue.length)reasons.push('overdue_follow_up');
  if(!actions.length)reasons.push('no_open_follow_up');
  if(entered!==null&&entered>=14)reasons.push('stage_stalled');
  if(closing!==null&&closing<0)reasons.push('expected_close_overdue');
  if(!reasons.length)continue;
  const priority=(overdue.length?35:0)+(!actions.length?20:0)+(entered!==null&&entered>=14?25:0)+(closing!==null&&closing<0?20:0);
  recommendations.push({opportunityId:opportunity.id,title:String(opportunity.title||'Untitled opportunity').slice(0,160),
   ownerUid:opportunity.ownerUid||null,stage:opportunity.stage||null,contactId:opportunity.contactId||null,
   amountMinor:Number.isSafeInteger(opportunity.amountMinor)?opportunity.amountMinor:null,
   reasons,priority:Math.min(priority,100),suggestion:overdue.length?'Review overdue follow-up and prepare a response':
    !actions.length?'Schedule an owner-reviewed follow-up':closing!==null&&closing<0?'Reassess the expected close date':'Review stalled opportunity and next steps',
   overdueFollowUpIds:overdue.map(f=>f.id).filter(Boolean).slice(0,10),
   nextFollowUpAt:next?.dueAt||null,requiresHumanApproval:true});
 }
 recommendations.sort((a,b)=>b.priority-a.priority||(b.amountMinor||0)-(a.amountMinor||0));
 return {recommendations:recommendations.slice(0,limit),totalFlagged:recommendations.length,
  analyzedOpportunities:opportunities.length,analyzedFollowUps:followUps.length,
  readOnly:true,note:'Recommendations are rule-based, not verified customer intent. No messages or CRM changes were made.'};
}
