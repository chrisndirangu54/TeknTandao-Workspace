// Deterministic, privacy-preserving local ad eligibility.
export const ALLOWED_INTERESTS=Object.freeze(['food','education','jobs','technology','shopping','transport','entertainment','health_general']);
const ident=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{5,100}$/.test(x);
export function validateSponsorInput(input){
 if(!input||typeof input!=='object'||Array.isArray(input))return {ok:false,reason:'invalid_input'};
 if(!['businessName','contactEmail','contactPhone'].every(k=>typeof input[k]==='string'))return {ok:false,reason:'missing_contact'};
 if(input.businessName.trim().length<3||input.businessName.length>120||
 !/^[^\s@]{1,64}@[^\s@]{1,180}\.[^\s@]{2,30}$/.test(input.contactEmail)||
 !/^254[17]\d{8}$/.test(input.contactPhone))return {ok:false,reason:'invalid_contact'};
 return {ok:true};
}
export function validateAdTargeting({siteIds,interestTags,startsAtMs,endsAtMs}){
 if(!Array.isArray(siteIds)||siteIds.length<1||siteIds.length>20||!siteIds.every(ident)||new Set(siteIds).size!==siteIds.length)return {ok:false,reason:'invalid_sites'};
 if(!Array.isArray(interestTags)||interestTags.length>5||!interestTags.every(x=>ALLOWED_INTERESTS.includes(x))||
 new Set(interestTags).size!==interestTags.length)return {ok:false,reason:'invalid_interests'};
 if(!Number.isSafeInteger(startsAtMs)||!Number.isSafeInteger(endsAtMs)||endsAtMs<=startsAtMs||
 endsAtMs-startsAtMs>31*86400000)return {ok:false,reason:'invalid_schedule'};
 return {ok:true};
}
export function selectLocalAds({campaigns,siteId,interests=[],personalizationConsent=false,now=Date.now()}){
 if(!ident(siteId))return [];
 const tags=personalizationConsent&&Array.isArray(interests)?
  interests.filter(x=>ALLOWED_INTERESTS.includes(x)).slice(0,5):[];
 return (Array.isArray(campaigns)?campaigns:[]).filter(c=>
  c?.status==='active'&&c.operatorApproved===true&&
  c?.fundingVerified===true&&c?.billingMode==='prepaid_test'&&
  Array.isArray(c.siteIds)&&c.siteIds.includes(siteId)&&
  Number.isSafeInteger(c.startsAtMs)&&Number.isSafeInteger(c.endsAtMs)&&now>=c.startsAtMs&&now<c.endsAtMs&&
  Number.isSafeInteger(c.rewardLimit)&&Number.isSafeInteger(c.rewardedCount)&&c.rewardedCount<c.rewardLimit
 ).map(c=>({
  ...c,matchScore:tags.length&&Array.isArray(c.interestTags)?
  c.interestTags.filter(x=>tags.includes(x)).length:0
 })).filter(c=>!c.interestTags?.length||!personalizationConsent||c.matchScore>0)
 .sort((a,b)=>b.matchScore-a.matchScore||a.id.localeCompare(b.id));
}
export function validateGoogleBundle({requiredAds,minutes,downloadMbps,maxDevices}){
 if(![3,4,5].includes(requiredAds)||minutes!==30||downloadMbps!==2||maxDevices!==1)
  return {ok:false,reason:'unsupported_bundle'};
 return {ok:true};
}
