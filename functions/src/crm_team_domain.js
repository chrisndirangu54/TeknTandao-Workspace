export function assignDealOwner(current,ownerUid,reason){
 if(!current||['won','lost'].includes(current.stage))throw new Error('Open deal required');
 if(typeof ownerUid!=='string'||!ownerUid.trim()||ownerUid.length>140)throw new Error('Valid sales owner required');
 if(typeof reason!=='string'||!reason.trim()||reason.length>500)throw new Error('Assignment reason required');
 return {ownerUid:ownerUid.trim(),assignmentReason:reason.trim()};
}
export function crmTeamPerformance(deals){
 if(!Array.isArray(deals)||deals.length>500)throw new Error('Team reporting limit exceeded');
 const groups=new Map();
 for(const d of deals){
  const owner=d.ownerUid||d.createdBy||'unassigned';
  if(!groups.has(owner))groups.set(owner,{ownerUid:owner,open:0,won:0,lost:0,openValueMinor:0,wonValueMinor:0});
  const row=groups.get(owner),amount=Number.isSafeInteger(d.amountMinor)&&d.amountMinor>=0?d.amountMinor:0;
  if(d.stage==='won'){row.won++;row.wonValueMinor+=amount;}
  else if(d.stage==='lost')row.lost++;
  else {row.open++;row.openValueMinor+=amount;}
 }
 return [...groups.values()].map(r=>({...r,winRatePercent:r.won+r.lost?Math.round(100*r.won/(r.won+r.lost)):null}))
  .sort((a,b)=>b.wonValueMinor-a.wonValueMinor||a.ownerUid.localeCompare(b.ownerUid));
}
