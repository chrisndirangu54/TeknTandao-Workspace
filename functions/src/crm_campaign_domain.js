export function crmCampaign(input){
 const name=input?.name,source=input?.source;
 const permitted=['organic','referral','paid_search','paid_social','email','events','partner','direct','other'];
 if(typeof name!=='string'||!name.trim()||name.length>140||!permitted.includes(source))
  throw new Error('Invalid campaign');
 return {name:name.trim(),source,status:'active',attributionModel:'single_source',revenueRecognized:false};
}
export function crmAttribution(deals,campaigns){
 if(!Array.isArray(deals)||!Array.isArray(campaigns)||deals.length>500||campaigns.length>200)
  throw new Error('Attribution report limit exceeded');
 return campaigns.map(c=>{
  const rows=deals.filter(d=>d.campaignId===c.id);
  const won=rows.filter(d=>d.stage==='won'),lost=rows.filter(d=>d.stage==='lost');
  return {campaignId:c.id,name:c.name,source:c.source,opportunities:rows.length,won:won.length,
   lost:lost.length,open:rows.length-won.length-lost.length,
   wonOpportunityMinor:won.reduce((sum,d)=>sum+(Number.isSafeInteger(d.amountMinor)&&d.amountMinor>=0?d.amountMinor:0),0),
   closedWinRatePercent:won.length+lost.length?Math.round(won.length*100/(won.length+lost.length)):null};
 });
}
