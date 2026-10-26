export function salesQuota(input){
 const ownerUid=input?.ownerUid,period=input?.period,targetMinor=input?.targetMinor;
 if(typeof ownerUid!=='string'||!ownerUid.trim()||ownerUid.length>140||
 typeof period!=='string'||!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)||
 !Number.isSafeInteger(targetMinor)||targetMinor<=0||targetMinor>1e12)
 throw new Error('Invalid sales quota');
 return {ownerUid:ownerUid.trim(),period,targetMinor,metric:'won_opportunity_value',status:'active'};
}
export function salesTerritory(input){
 const name=input?.name,ownerUid=input?.ownerUid;
 if(typeof name!=='string'||!name.trim()||name.length>120||
 typeof ownerUid!=='string'||!ownerUid.trim()||ownerUid.length>140)
 throw new Error('Invalid territory assignment');
 return {name:name.trim(),ownerUid:ownerUid.trim(),status:'active'};
}
export function quotaAttainment(quotas,deals,period){
 if(!Array.isArray(quotas)||!Array.isArray(deals)||quotas.length>300||deals.length>500)throw new Error('Reporting bounds exceeded');
 return quotas.filter(q=>q.period===period).map(q=>{
  const won=deals.filter(d=>(d.ownerUid||d.createdBy)===q.ownerUid&&d.stage==='won'&&
    typeof d.closedAt==='string'&&d.closedAt.slice(0,7)===period);
  const wonMinor=won.reduce((sum,d)=>sum+(Number.isSafeInteger(d.amountMinor)&&d.amountMinor>=0?d.amountMinor:0),0);
  return {ownerUid:q.ownerUid,targetMinor:q.targetMinor,wonOpportunityMinor:wonMinor,
    attainmentPercent:Math.round(wonMinor*100/q.targetMinor),wonDeals:won.length,
    revenueRecognized:false};
 });
}
