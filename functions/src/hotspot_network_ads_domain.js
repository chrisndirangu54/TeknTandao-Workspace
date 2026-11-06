// Deterministic, explainable network-advertising planning. Not proof of impressions.
export function validateShare(basisPoints){
 return Number.isSafeInteger(basisPoints)&&basisPoints>=1000&&basisPoints<=9000;
}
export function splitTestBudget(amountKes,operatorBasisPoints=7000){
 if(!Number.isSafeInteger(amountKes)||amountKes<0||!validateShare(operatorBasisPoints))
  throw new Error('Invalid non-settled budget/share');
 const operator=Math.floor(amountKes*operatorBasisPoints/10000);
 return {operatorIllustrativeKes:operator,platformIllustrativeKes:amountKes-operator,
  settledKes:0,payableKes:0,liveFunds:false};
}
export function allocatePreview({sites=[],budgetKes=0,maxLocations=50,category='all'}){
 if(!Number.isSafeInteger(budgetKes)||budgetKes<0||!Number.isSafeInteger(maxLocations)||
 maxLocations<1||maxLocations>100)return [];
 const eligible=sites.filter(s=>s?.approved===true&&s?.ownerOptIn===true&&
  s?.gatewayVerified===true&&s?.labOnly===true&&
  s?.category&&typeof s.category==='string'&&
  (category==='all'||s.category===category)&&
  Number.isSafeInteger(s.capacityDaily)&&s.capacityDaily>0&&
  Number.isSafeInteger(s.activeUniqueDays)&&s.activeUniqueDays>=0&&
  Number.isSafeInteger(s.verifiedAvailabilityPct)&&s.verifiedAvailabilityPct>=0&&
  s.verifiedAvailabilityPct<=100&&
  typeof s.orgId==='string'&&typeof s.siteId==='string'&&typeof s.registryId==='string');
 const ranked=eligible.map(s=>{
  // Transparent inventory proxy, NOT click or conversion predictions.
  const reliability=s.verifiedAvailabilityPct/100;
  const evidence=Math.min(1,s.activeUniqueDays/14);
  return {...s,capacityScore:Math.max(0,Math.floor(s.capacityDaily*reliability*evidence))};
 }).filter(s=>s.capacityScore>0).sort((a,b)=>b.capacityScore-a.capacityScore||
 a.registryId.localeCompare(b.registryId)).slice(0,maxLocations);
 const total=ranked.reduce((n,s)=>n+s.capacityScore,0);
 let allocated=0;
 return ranked.map((s,i)=>{
  const proposedKes=i===ranked.length-1?budgetKes-allocated:Math.floor(budgetKes*s.capacityScore/total);
  allocated+=proposedKes;
  return {registryId:s.registryId,orgId:s.orgId,siteId:s.siteId,
   category:s.category,capacityScore:s.capacityScore,proposedKes,
   verifiedAdImpressions:0,earnedKes:0};
 });
}
export function measurePilot(rows=[]){
 const valid=rows.filter(r=>Number.isSafeInteger(r?.sessionsIssued)&&r.sessionsIssued>=0&&
 Number.isSafeInteger(r?.gatewayAccepts)&&r.gatewayAccepts>=0&&
 Number.isSafeInteger(r?.verifiedRedemptions)&&r.verifiedRedemptions>=0&&
 r.gatewayAccepts<=r.sessionsIssued&&r.verifiedRedemptions<=r.gatewayAccepts);
 const sum=k=>valid.reduce((a,r)=>a+r[k],0);
 const issued=sum('sessionsIssued'),admissions=sum('gatewayAccepts'),redeemed=sum('verifiedRedemptions');
 return {locations:valid.length,sessionsIssued:issued,gatewayAccepts:admissions,
  verifiedRedemptions:redeemed,admissionRate:issued?admissions/issued:null,
  verifiedRedemptionRate:admissions?redeemed/admissions:null,
  attributedSales:0,incrementalConversions:null,incrementalLift:null,
  reason:'Requires real signed events, redemption verification and randomized holdout'};
}
export function riskFlags({verifiedRedemptions=0,gatewayAccepts=0,sessionsIssued=0}={}){
 if(![verifiedRedemptions,gatewayAccepts,sessionsIssued].every(x=>Number.isSafeInteger(x)&&x>=0))
 return ['invalid_counts'];
 const reasons=[];
 if(gatewayAccepts>sessionsIssued||verifiedRedemptions>gatewayAccepts)reasons.push('impossible_event_order');
 if(sessionsIssued>=20&&gatewayAccepts===0)reasons.push('zero_gateway_admissions');
 return reasons;
}
