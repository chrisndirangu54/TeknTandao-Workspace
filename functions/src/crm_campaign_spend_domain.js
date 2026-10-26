export function campaignSpend(input){
 const amountMinor=input?.amountMinor,occurredOn=input?.occurredOn;
 if(!Number.isSafeInteger(amountMinor)||amountMinor<=0||amountMinor>1e12||
 typeof occurredOn!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(occurredOn)||
 !Number.isFinite(Date.parse(occurredOn))||
 new Date(occurredOn).toISOString().slice(0,10)!==occurredOn)
 throw new Error('Valid spend amount and date required');
 const note=input?.note??'';
 if(typeof note!=='string'||note.length>500)throw new Error('Invalid spend note');
 return {amountMinor,occurredOn,note:note.trim(),currency:'KES',source:'manual'};
}
export function campaignEfficiency(campaigns,deals,spend){
 if(!Array.isArray(campaigns)||!Array.isArray(deals)||!Array.isArray(spend)||
 campaigns.length>200||deals.length>500||spend.length>500)throw new Error('Report exceeds limits');
 return campaigns.map(c=>{
  const attributed=deals.filter(d=>d.campaignId===c.id);
  const totalSpendMinor=spend.filter(s=>s.campaignId===c.id).reduce((sum,s)=>sum+s.amountMinor,0);
  const won=attributed.filter(d=>d.stage==='won');
  const wonValueMinor=won.reduce((sum,d)=>sum+(Number.isSafeInteger(d.amountMinor)&&d.amountMinor>=0?d.amountMinor:0),0);
  return {campaignId:c.id,name:c.name,source:c.source,spendMinor:totalSpendMinor,
   opportunities:attributed.length,wonDeals:won.length,wonOpportunityMinor:wonValueMinor,
   spendPerOpportunityMinor:attributed.length?Math.round(totalSpendMinor/attributed.length):null,
   spendPerWonDealMinor:won.length?Math.round(totalSpendMinor/won.length):null,
   returnOnSpend:null,recognizedRevenue:false};
 });
}
