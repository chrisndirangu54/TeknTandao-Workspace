export function crmConversionReport(deals,period){
 if(typeof period!=='string'||!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)||!Array.isArray(deals)||deals.length>500)throw new Error('Invalid conversion report');
 const closed=deals.filter(d=>['won','lost'].includes(d.stage)&&typeof d.closedAt==='string'&&d.closedAt.slice(0,7)===period);
 const wins=closed.filter(d=>d.stage==='won'),losses=closed.filter(d=>d.stage==='lost');
 const reasons=new Map();
 for(const d of losses){const reason=typeof d.closedReason==='string'&&d.closedReason.trim()?d.closedReason.trim():'Unspecified';reasons.set(reason,(reasons.get(reason)||0)+1);}
 return {period,won:wins.length,lost:losses.length,closedDeals:closed.length,
  closedWinRatePercent:closed.length?Math.round(100*wins.length/closed.length):null,
  wonValueMinor:wins.reduce((a,d)=>a+(Number.isSafeInteger(d.amountMinor)?d.amountMinor:0),0),
  lossReasons:[...reasons].map(([reason,count])=>({reason,count})).sort((a,b)=>b.count-a.count),
  methodology:'Closed deals only. Current-stage counts are not historical stage-conversion rates.'};
}
