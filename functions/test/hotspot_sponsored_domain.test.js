import test from 'node:test';import assert from 'node:assert/strict';
import {validateSponsoredCampaign,evaluateSponsoredCompletion,scoreHotspotAnomaly,classifyEnvironmentalRisk} from '../src/hotspot_sponsored_domain.js';
const now=Date.now(),site={id:'site_00001',state:'commissioned',labOnly:true,gatewayVerified:true,radiusEnabled:true};
const plan={id:'plan_00001',siteId:site.id,state:'published',priceKes:0,durationMinutes:15};
const campaign={siteId:site.id,planId:plan.id,status:'active',operatorApproved:true,rewardLimit:100,
 rewardedCount:0,startsAtMs:now-1000,endsAtMs:now+1000000,minDwellSeconds:15,
 creativeUrl:'https://cdn.example.org/campaign.png'};
test('ads reward free internet only on commissioned lab sites and active budget',()=>{
 assert.equal(validateSponsoredCampaign({campaign,site,plan,now}).allowed,true);
 assert.equal(validateSponsoredCampaign({campaign,site,plan:{...plan,priceKes:10},now}).allowed,false);
 assert.equal(validateSponsoredCampaign({campaign:{...campaign,rewardedCount:100},site,plan,now}).reason,'campaign_exhausted');
 assert.equal(validateSponsoredCampaign({campaign,site:{...site,gatewayVerified:false},plan,now}).allowed,false);
});
test('sponsor completion requires explicit consent and server elapsed time',()=>{
 const challenge={status:'started',issuedAtMs:now-20000,minDwellSeconds:15};
 assert.equal(evaluateSponsoredCompletion({challenge,consent:true,dwellNow:now}).allowed,true);
 assert.equal(evaluateSponsoredCompletion({challenge,consent:false,dwellNow:now}).allowed,false);
 assert.equal(evaluateSponsoredCompletion({challenge:{...challenge,issuedAtMs:now-1000},consent:true,dwellNow:now}).allowed,false);
});
test('anomaly and environmental risk report actual rule-based provenance',()=>{
 assert.equal(scoreHotspotAnomaly({replayedNonces:8}).severity,'high');
 assert.equal(scoreHotspotAnomaly({failedAdmissions:-1}).available,false);
 assert.deepEqual(classifyEnvironmentalRisk({rainfallMm24h:55,backupBatteryPercent:15}).flags,['heavy_rain','low_backup_power']);
});
