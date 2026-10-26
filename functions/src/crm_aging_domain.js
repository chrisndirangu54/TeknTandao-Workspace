const dateMs=v=>{if(typeof v==='string')return Date.parse(v);if(v?.seconds!=null)return v.seconds*1000;return NaN;};
export function crmAgingReport(deals,asOf,thresholdDays=14){
 const now=Date.parse(asOf);
 if(!Number.isFinite(now)||!Number.isInteger(thresholdDays)||thresholdDays<1||thresholdDays>365||
 !Array.isArray(deals)||deals.length>500)throw new Error('Invalid aging report');
 const open=deals.filter(d=>!['won','lost'].includes(d.stage));
 const rows=open.map(d=>{
  const start=dateMs(d.stageEnteredAt)||dateMs(d.createdAt);
  const stageDays=Number.isFinite(start)?Math.max(0,Math.floor((now-start)/86400000)):null;
  return {id:d.id,title:d.title,stage:d.stage,ownerUid:d.ownerUid||d.createdBy||null,
   stageDays,stalled:stageDays===null?null:stageDays>=thresholdDays};
 });
 return {thresholdDays,openDeals:rows.length,stalledDeals:rows.filter(r=>r.stalled===true).length,
  unknownAgeDeals:rows.filter(r=>r.stalled===null).length,rows,
  note:'Stage age requires a recorded entry timestamp; missing legacy timestamps are unknown.'};
}
