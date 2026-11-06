// Robust descriptive analytics for Wi-Fi occupancy and WAN latency.
// Source: validated signed IoT samples. Not a trained predictive model.
export function analyzeHotspotTelemetry(records){
 const clean=(records||[]).filter(r=>r&&Number.isSafeInteger(r.observedAtMs)&&
  r.metrics&&Number.isSafeInteger(r.metrics.clientCount)&&r.metrics.clientCount>=0&&
  r.metrics.clientCount<=100000).sort((a,b)=>a.observedAtMs-b.observedAtMs).slice(-500);
 if(clean.length<5)return {available:false,reason:'need_at_least_five_signed_samples',sampleCount:clean.length};
 const values=clean.map(r=>r.metrics.clientCount);
 const median=xs=>{const z=[...xs].sort((a,b)=>a-b),i=z.length>>1;
  return z.length%2?z[i]:(z[i-1]+z[i])/2;};
 const med=median(values),mad=median(values.map(v=>Math.abs(v-med)));
 const last=values.at(-1),robustZ=mad===0?(last===med?0:10):0.6745*(last-med)/mad;
 const half=Math.floor(values.length/2);
 const earlier=values.slice(0,half).reduce((s,v)=>s+v,0)/half;
 const recent=values.slice(half).reduce((s,v)=>s+v,0)/(values.length-half);
 const deltaPercent=earlier===0?null:Math.round((recent-earlier)/earlier*1000)/10;
 const validLatency=clean.map(r=>r.metrics.latencyMs).filter(x=>typeof x==='number'&&Number.isFinite(x)&&x>=0);
 const p95=validLatency.length?validLatency.sort((a,b)=>a-b)[Math.ceil(0.95*validLatency.length)-1]:null;
 const outages=clean.filter(r=>r.metrics.wanUp===false).length;
 return {available:true,sampleCount:clean.length,medianClients:med,latestClients:last,
  occupancyOutlier:Math.abs(robustZ)>=3.5,robustZScore:Number(robustZ.toFixed(2)),
  trendPercent:deltaPercent,latencyP95Ms:p95,wanOutageSamples:outages,
  observedStartMs:clean[0].observedAtMs,observedEndMs:clean.at(-1).observedAtMs,
  caveat:'Descriptive sample statistics; missing observations and sampling bias prevent uptime or revenue estimates.'};
}
export function forecastNextHourClients(records){
 const data=analyzeHotspotTelemetry(records);
 if(!data.available||data.sampleCount<10)return {available:false,reason:'insufficient_history'};
 const slope=typeof data.trendPercent==='number'?data.trendPercent/100:0;
 const estimate=Math.max(0,Math.round(data.latestClients*(1+Math.max(-0.5,Math.min(0.5,slope)))));
 return {available:true,forecastClients:estimate,method:'bounded_trend_extrapolation',
  confidence:'unquantified',suitability:'planning_only_not_capacity_enforcement'};
}
