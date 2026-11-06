import test from 'node:test';import assert from 'node:assert/strict';
import {selectLocalAds,validateSponsorInput,validateAdTargeting,validateGoogleBundle} from '../src/hotspot_advertising_domain.js';
const now=Date.now(),base={id:'ad_00001',status:'active',operatorApproved:true,fundingVerified:true,
 billingMode:'prepaid_test',siteIds:['site_00001'],interestTags:['food'],
 startsAtMs:now-500,endsAtMs:now+100000,rewardLimit:100,rewardedCount:1};
test('interest targeting never uses personal profile without opt in',()=>{
 assert.equal(selectLocalAds({campaigns:[base],siteId:'site_00001',now}).length,1);
 assert.equal(selectLocalAds({campaigns:[base],siteId:'site_00001',now,interests:['education'],personalizationConsent:true}).length,0);
 assert.equal(selectLocalAds({campaigns:[base],siteId:'site_00001',now,interests:['food'],personalizationConsent:true}).length,1);
 assert.equal(selectLocalAds({campaigns:[{...base,fundingVerified:false}],siteId:'site_00001',now}).length,0);
});
test('local campaign tags and schedule validated',()=>{
 assert.equal(validateAdTargeting({siteIds:['site_00001'],interestTags:['jobs'],startsAtMs:1,endsAtMs:2}).ok,true);
 assert.equal(validateAdTargeting({siteIds:['site_00001'],interestTags:['political_party'],startsAtMs:1,endsAtMs:2}).ok,false);
});
test('bundle is only 3–5 ads per 30 minutes at limited speed',()=>{
 assert.equal(validateGoogleBundle({requiredAds:4,minutes:30,downloadMbps:2,maxDevices:1}).ok,true);
 assert.equal(validateGoogleBundle({requiredAds:6,minutes:30,downloadMbps:2,maxDevices:1}).ok,false);
});
