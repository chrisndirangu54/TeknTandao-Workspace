// Pure sponsored Wi-Fi policy: explicit consent, server-side dwell, frequency
// limits, budget reservation and fail-closed reward validation.
export const SPONSOR_POLICY=Object.freeze({minDwellSeconds:8,maxDwellSeconds:90,maxDailyRewards:3,maxSessionSeconds:3600});
const validId=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{5,100}$/.test(x);
export function validateSponsoredCampaign({campaign,site,plan,now=Date.now()}){
 const reject=reason=>({allowed:false,reason});
 if(!campaign||!site||!plan)return reject('missing_records');
 if(![campaign.siteId,campaign.planId,site.id,plan.id].every(validId))return reject('invalid_scope');
 if(campaign.siteId!==site.id||campaign.planId!==plan.id||plan.siteId!==site.id)return reject('cross_site');
 if(site.state!=='commissioned'||site.labOnly!==true||site.gatewayVerified!==true||site.radiusEnabled!==true)return reject('gateway_not_commissioned');
 if(campaign.status!=='active'||campaign.operatorApproved!==true)return reject('campaign_not_approved');
 if(plan.state!=='published'||plan.priceKes!==0)return reject('must_use_free_plan');
 if(!Number.isSafeInteger(plan.durationMinutes)||plan.durationMinutes<1||plan.durationMinutes>60)return reject('plan_duration');
 if(!Number.isSafeInteger(campaign.rewardLimit)||campaign.rewardLimit<1||campaign.rewardLimit>100000)return reject('invalid_limit');
 if(!Number.isSafeInteger(campaign.rewardedCount)||campaign.rewardedCount<0||campaign.rewardedCount>=campaign.rewardLimit)return reject('campaign_exhausted');
 if(!Number.isSafeInteger(campaign.startsAtMs)||!Number.isSafeInteger(campaign.endsAtMs)||now<campaign.startsAtMs||now>=campaign.endsAtMs)return reject('outside_campaign_window');
 if(!Number.isSafeInteger(campaign.minDwellSeconds)||campaign.minDwellSeconds<SPONSOR_POLICY.minDwellSeconds||campaign.minDwellSeconds>SPONSOR_POLICY.maxDwellSeconds)return reject('invalid_dwell');
 if(typeof campaign.creativeUrl!=='string'||!/^https:\/\//.test(campaign.creativeUrl))return reject('invalid_creative');
 return {allowed:true,reason:'eligible_lab_campaign'};
}
export function evaluateSponsoredCompletion({challenge,consent,dwellNow=Date.now()}){
 if(!challenge||challenge.status!=='started'||consent!==true)return {allowed:false,reason:'not_consented_or_completed'};
 if(!Number.isSafeInteger(challenge.issuedAtMs)||!Number.isSafeInteger(challenge.minDwellSeconds))return {allowed:false,reason:'invalid_challenge'};
 const elapsed=dwellNow-challenge.issuedAtMs;
 if(elapsed<challenge.minDwellSeconds*1000)return {allowed:false,reason:'dwell_not_met'};
 if(elapsed>300000||elapsed<0)return {allowed:false,reason:'expired_challenge'};
 return {allowed:true,reason:'time_gate_passed_not_verified_view'};
}
export function scoreHotspotAnomaly({failedAdmissions=null,replayedNonces=null,disconnectBacklog=null,missingHeartbeatMinutes=null}={}){
 for(const value of [failedAdmissions,replayedNonces,disconnectBacklog])
  if(value!==null&&(!Number.isSafeInteger(value)||value<0))return {available:false,reason:'invalid_inputs'};
 if(missingHeartbeatMinutes!==null&&(!Number.isFinite(missingHeartbeatMinutes)||missingHeartbeatMinutes<0))return {available:false,reason:'invalid_heartbeat'};
 const factors={failedAdmissions,replayedNonces,disconnectBacklog,missingHeartbeatMinutes};
 const measured=Object.values(factors).filter(v=>v!==null).length;
 if(!measured)return {available:false,reason:'no_operational_evidence',factors};
 const score=Math.min(100,Math.round(
  Math.min(40,(failedAdmissions??0)*3)+Math.min(25,(replayedNonces??0)*9)+
  Math.min(20,(disconnectBacklog??0)*5)+Math.min(15,(missingHeartbeatMinutes??0)/5)
 ));
 return {available:true,score,severity:score>=70?'high':score>=35?'medium':'low',
  evidenceCompleteness:measured+'/4',method:'partial_rule_based_not_trained_ml',factors,
  caveat:'Missing factors are unknown, not zero risk'};
}
export function classifyEnvironmentalRisk({rainfallMm24h=null,windKph=null,backupBatteryPercent=null}={}){
 const flags=[];
 if(rainfallMm24h!==null&&Number.isFinite(rainfallMm24h)&&rainfallMm24h>=50)flags.push('heavy_rain');
 if(windKph!==null&&Number.isFinite(windKph)&&windKph>=50)flags.push('high_wind');
 if(backupBatteryPercent!==null&&Number.isFinite(backupBatteryPercent)&&backupBatteryPercent<20)flags.push('low_backup_power');
 return {flags,requiresFieldVerification:flags.length>0,source:'user_or_trusted_telemetry_not_satellite_forecast'};
}
