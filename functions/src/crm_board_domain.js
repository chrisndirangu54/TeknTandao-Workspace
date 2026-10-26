export const crmStages=['qualification','discovery','proposal','negotiation','won','lost'];
export function crmBoardMetrics(deals,followUps,asOf){
 if(!Array.isArray(deals)||!Array.isArray(followUps)||deals.length>500||followUps.length>500)throw new Error('Board reporting limit exceeded');
 const date=Date.parse(asOf);if(!Number.isFinite(date))throw new Error('Invalid reporting date');
 const columns=crmStages.map(stage=>{
  const rows=deals.filter(d=>d.stage===stage);
  const amountMinor=rows.reduce((sum,d)=>sum+(Number.isSafeInteger(d.amountMinor)&&d.amountMinor>=0?d.amountMinor:0),0);
  return {stage,count:rows.length,amountMinor,weightedMinor:rows.reduce((sum,d)=>sum+
   (Number.isSafeInteger(d.amountMinor)&&d.amountMinor>=0&&Number.isInteger(d.probability)?Math.round(d.amountMinor*d.probability/100):0),0)};
 });
 const open=deals.filter(d=>!['won','lost'].includes(d.stage));
 const won=deals.filter(d=>d.stage==='won').length,lost=deals.filter(d=>d.stage==='lost').length;
 const overdue=followUps.filter(t=>t.status==='open'&&typeof t.dueAt==='string'&&Number.isFinite(Date.parse(t.dueAt))&&Date.parse(t.dueAt)<date).length;
 return {columns,openDeals:open.length,wonDeals:won,lostDeals:lost,
  winRateClosedPercent:won+lost?Math.round(won*100/(won+lost)):null,overdueFollowUps:overdue,
  partialSnapshot:true};
}
