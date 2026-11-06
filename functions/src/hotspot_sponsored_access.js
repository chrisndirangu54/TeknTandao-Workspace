// Sponsored hotspot access: tenant-isolated, opt-in, lab-only reward passes.
// An elapsed time gate is not proof of viewing; do not bill sponsors on this metric.
// No external tracking, customer payment, cookie identity or router commands.
import {randomUUID,randomBytes,createHash,createHmac} from 'node:crypto';
import {getFirestore,FieldValue} from 'firebase-admin/firestore';
import {onCall,HttpsError} from 'firebase-functions/v2/https';
import {validateSponsoredCampaign,evaluateSponsoredCompletion,SPONSOR_POLICY} from './hotspot_sponsored_domain.js';
const fail=(code,msg)=>{throw new HttpsError(code,msg);};
const valid=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{5,100}$/.test(x);
const exact=(obj,keys)=>{if(!obj||typeof obj!=='object'||Array.isArray(obj)||Object.keys(obj).some(k=>!keys.includes(k)))fail('invalid-argument','Invalid request');};
const db=()=>getFirestore(),org=orgId=>db().collection('organizations').doc(orgId);
const root=orgId=>org(orgId).collection('hotspotV2').doc('control');
const callable=fn=>onCall({region:'europe-west1',timeoutSeconds:50},fn);
const publicCallable=fn=>onCall({region:'europe-west1',timeoutSeconds:50,enforceAppCheck:true},fn);
async function admin(req){
 if(!req.auth)fail('unauthenticated','Sign in required');
 if(!valid(req.data?.orgId))fail('invalid-argument','Invalid organization');
 const m=await org(req.data.orgId).collection('members').doc(req.auth.uid).get();
 if(!m.exists||!['owner','admin'].includes(m.data()?.role))fail('permission-denied','Admin required');
 return {root:root(req.data.orgId),uid:req.auth.uid};
}
function auth(req){if(!req.auth||typeof req.auth.uid!=='string')fail('unauthenticated','Sign-in or anonymous Firebase Auth required');}
const timestamp=()=>FieldValue.serverTimestamp();
const audit=(tx,ref,actor,action,target)=>tx.create(ref.collection('audit').doc(randomUUID()),{actor,action,target,at:timestamp()});

export const hotspotV2CreateSponsorCampaign=callable(async req=>{
 exact(req.data,['orgId','siteId','planId','title','advertiser','creativeUrl','destinationUrl','rewardLimit','minDwellSeconds','startsAtMs','endsAtMs']);
 const {root:space,uid}=await admin(req),d=req.data;
 if(!valid(d.siteId)||!valid(d.planId)||typeof d.title!=='string'||d.title.trim().length<4||d.title.length>100||
 typeof d.advertiser!=='string'||d.advertiser.trim().length<2||d.advertiser.length>100||
 typeof d.creativeUrl!=='string'||!/^https:\/\//.test(d.creativeUrl)||d.creativeUrl.length>1000||
 typeof d.destinationUrl!=='string'||!/^https:\/\//.test(d.destinationUrl)||d.destinationUrl.length>1000||
 !Number.isSafeInteger(d.rewardLimit)||d.rewardLimit<1||d.rewardLimit>100000||
 !Number.isSafeInteger(d.minDwellSeconds)||d.minDwellSeconds<8||d.minDwellSeconds>90||
 !Number.isSafeInteger(d.startsAtMs)||!Number.isSafeInteger(d.endsAtMs)||
 d.endsAtMs<=d.startsAtMs||d.endsAtMs-d.startsAtMs>31*86400000)
 fail('invalid-argument','Invalid campaign configuration');
 const campaign=space.collection('sponsorCampaigns').doc(randomUUID());
 await db().runTransaction(async tx=>{
  const [site,plan]=await Promise.all([tx.get(space.collection('sites').doc(d.siteId)),tx.get(space.collection('plans').doc(d.planId))]);
  if(!site.exists||!plan.exists||site.data().state!=='commissioned'||site.data().labOnly!==true||
   plan.data().siteId!==site.id||plan.data().state!=='published'||plan.data().priceKes!==0||
   plan.data().durationMinutes>60)
   fail('failed-precondition','Active free lab site and plan required');
  tx.create(campaign,{siteId:d.siteId,planId:d.planId,title:d.title.trim(),advertiser:d.advertiser.trim(),
   creativeUrl:d.creativeUrl,destinationUrl:d.destinationUrl,rewardLimit:d.rewardLimit,rewardedCount:0,
   minDwellSeconds:d.minDwellSeconds,startsAtMs:d.startsAtMs,endsAtMs:d.endsAtMs,
   status:'draft',operatorApproved:false,createdBy:uid,createdAt:timestamp()});
  audit(tx,space,uid,'sponsor_campaign_created',campaign.id);
 });
 return {campaignId:campaign.id,status:'draft',sponsorBilled:false};
});

export const hotspotV2ApproveSponsorCampaign=callable(async req=>{
 exact(req.data,['orgId','campaignId']);
 const {root:space,uid}=await admin(req);
 if(!valid(req.data.campaignId))fail('invalid-argument','Invalid campaign');
 const ref=space.collection('sponsorCampaigns').doc(req.data.campaignId);
 await db().runTransaction(async tx=>{
  const snap=await tx.get(ref);
  if(!snap.exists||snap.data().status!=='draft'||snap.data().createdBy===uid)fail('failed-precondition','Independent campaign review required');
  const [site,plan]=await Promise.all([tx.get(space.collection('sites').doc(snap.data().siteId)),tx.get(space.collection('plans').doc(snap.data().planId))]);
  if(!site.exists||!plan.exists||site.data().labOnly!==true||site.data().gatewayVerified!==true||
    site.data().radiusEnabled!==true||plan.data().priceKes!==0||plan.data().state!=='published'||
    plan.data().siteId!==site.id||plan.data().durationMinutes>60)
   fail('failed-precondition','Lab gateway must be commissioned');
  tx.update(ref,{status:'active',operatorApproved:true,approvedBy:uid,approvedAt:timestamp()});
  audit(tx,space,uid,'sponsor_campaign_approved',ref.id);
 });
 return {active:true,labOnly:true,sponsorBillingEnabled:false};
});

export const hotspotV2PublicSponsors=publicCallable(async req=>{
 exact(req.data,['orgId','siteId']);auth(req);
 if(!valid(req.data.orgId)||!valid(req.data.siteId))fail('invalid-argument','Invalid IDs');
 const space=root(req.data.orgId);
 const [site,plans,ads]=await Promise.all([
   space.collection('sites').doc(req.data.siteId).get(),
   space.collection('plans').where('siteId','==',req.data.siteId).limit(50).get(),
   space.collection('sponsorCampaigns').where('siteId','==',req.data.siteId).limit(30).get()
 ]);
 if(!site.exists||site.data().state!=='commissioned')fail('not-found','Site unavailable');
 const available=ads.docs.flatMap(doc=>{
  const plan=plans.docs.find(p=>p.id===doc.data().planId);
  const eligible=validateSponsoredCampaign({campaign:doc.data(),site:{id:site.id,...site.data()},
    plan:plan?{id:plan.id,...plan.data()}:null});
  return eligible.allowed?[{id:doc.id,title:doc.data().title,advertiser:doc.data().advertiser,
   creativeUrl:doc.data().creativeUrl,destinationUrl:doc.data().destinationUrl,
   minDwellSeconds:doc.data().minDwellSeconds,rewardMinutes:plan.data().durationMinutes}]:[];
 });
 return {campaigns:available,labOnly:true,sponsorBillingEnabled:false,consentRequired:true};
});

export const hotspotV2BeginSponsoredAccess=publicCallable(async req=>{
 exact(req.data,['orgId','campaignId','consent']);auth(req);
 if(!valid(req.data.orgId)||!valid(req.data.campaignId)||req.data.consent!==true)
  fail('invalid-argument','Explicit opt-in required');
 const space=root(req.data.orgId),campaignRef=space.collection('sponsorCampaigns').doc(req.data.campaignId);
 const campaign=await campaignRef.get();
 if(!campaign.exists)fail('not-found','Campaign unavailable');
 const site=await space.collection('sites').doc(campaign.data().siteId).get();
 const plan=await space.collection('plans').doc(campaign.data().planId).get();
 if(!site.exists||!plan.exists||!validateSponsoredCampaign({campaign:campaign.data(),
  site:{id:site.id,...site.data()},plan:{id:plan.id,...plan.data()}}).allowed)
 fail('failed-precondition','Campaign not eligible');
 const challenge=space.collection('sponsorChallenges').doc(randomUUID());
 const issuedAtMs=Date.now();
 await challenge.create({uid:req.auth.uid,campaignId:campaign.id,siteId:site.id,planId:plan.id,
  status:'started',consent:true,issuedAtMs,minDwellSeconds:campaign.data().minDwellSeconds,
  expiresAt:new Date(issuedAtMs+5*60000),createdAt:timestamp()});
 return {challengeId:challenge.id,minDwellSeconds:campaign.data().minDwellSeconds,
  disclosure:'Viewing time is not independently measurable; your reward is based on a server-side minimum time gate.',
  tracking:'No ad network identifier is generated or transmitted by this endpoint.'};
});

export const hotspotV2ClaimSponsoredAccess=publicCallable(async req=>{
 exact(req.data,['orgId','challengeId']);auth(req);
 if(!valid(req.data.orgId)||!valid(req.data.challengeId))fail('invalid-argument','Invalid IDs');
 const space=root(req.data.orgId),challengeRef=space.collection('sponsorChallenges').doc(req.data.challengeId);
 const pass=space.collection('vouchers').doc(randomUUID()),auditRef=space.collection('audit').doc(randomUUID());
 const code=randomBytes(16).toString('hex').toUpperCase(),salt=randomBytes(16).toString('hex');
 let rewardExpiryMs=null;
 const today=new Date().toISOString().slice(0,10);
 const uidDigest=createHash('sha256').update(req.auth.uid).digest('hex');
 const counter=space.collection('sponsorDailyCaps').doc(today+'_'+uidDigest);
 await db().runTransaction(async tx=>{
  const [challenge,cap]=await Promise.all([tx.get(challengeRef),tx.get(counter)]);
  if(!challenge.exists||challenge.data().uid!==req.auth.uid)fail('permission-denied','Challenge owner mismatch');
  const policy=evaluateSponsoredCompletion({challenge:challenge.data(),consent:challenge.data().consent,dwellNow:Date.now()});
  if(!policy.allowed)fail('failed-precondition',policy.reason);
  if(cap.exists&&cap.data().count>=SPONSOR_POLICY.maxDailyRewards)fail('resource-exhausted','Daily sponsored limit reached');
  const campaignRef=space.collection('sponsorCampaigns').doc(challenge.data().campaignId);
  const camp=await tx.get(campaignRef);
  if(!camp.exists)fail('failed-precondition','Campaign missing');
  const [site,plan]=await Promise.all([tx.get(space.collection('sites').doc(challenge.data().siteId)),
    tx.get(space.collection('plans').doc(challenge.data().planId))]);
  if(!site.exists||!plan.exists||!validateSponsoredCampaign({campaign:camp.data(),
   site:{id:site.id,...site.data()},plan:{id:plan.id,...plan.data()}}).allowed)
   fail('failed-precondition','Campaign no longer eligible');
  const expiresAtMs=Date.now()+plan.data().durationMinutes*60000;
  rewardExpiryMs=expiresAtMs;
  tx.create(pass,{siteId:site.id,planId:plan.id,state:'provisioned',gatewayProvisioned:true,
   labOnly:true,accessMethod:'sponsored',sponsorCampaignId:camp.id,secretSalt:salt,
   secretHash:createHmac('sha256',Buffer.from(salt,'hex')).update(code).digest('hex'),
   codeLast4:code.slice(-4),expiresAtMs,redeemed:false,paymentVerified:false,
   createdAt:timestamp(),createdBy:'sponsored_challenge'});
  tx.update(campaignRef,{rewardedCount:FieldValue.increment(1)});
  tx.update(challengeRef,{status:'reward_issued',rewardVoucherId:pass.id,claimedAt:timestamp()});
  tx.set(counter,{count:FieldValue.increment(1),lastClaimAt:timestamp()},{merge:true});
  tx.create(auditRef,{actor:'authenticated_guest',action:'sponsor_reward_issued',
   target:pass.id,at:timestamp(),adMeasurement:'unverified_time_gate'});
 });
 return {voucherId:pass.id,oneTimeCode:code,expiresAtMs:rewardExpiryMs,
  labOnly:true,networkConnected:false,sponsorBilled:false};
});

export const hotspotV2SponsorAdminList=callable(async req=>{
 exact(req.data,['orgId']);const {root:space}=await admin(req);
 const ads=await space.collection('sponsorCampaigns').limit(100).get();
 return {campaigns:ads.docs.map(d=>({id:d.id,title:d.data().title,
  advertiser:d.data().advertiser,siteId:d.data().siteId,planId:d.data().planId,
  status:d.data().status,operatorApproved:d.data().operatorApproved===true,
  rewardedCount:d.data().rewardedCount,rewardLimit:d.data().rewardLimit,
  startsAtMs:d.data().startsAtMs,endsAtMs:d.data().endsAtMs,
  sponsorBilled:false})),limit:100};
});

export const hotspotV2PauseSponsorCampaign=callable(async req=>{
 exact(req.data,['orgId','campaignId']);const {root:space,uid}=await admin(req);
 if(!valid(req.data.campaignId))fail('invalid-argument','Invalid campaign');
 const ref=space.collection('sponsorCampaigns').doc(req.data.campaignId);
 await db().runTransaction(async tx=>{
  const doc=await tx.get(ref);
  if(!doc.exists||doc.data().status!=='active')fail('failed-precondition','Campaign not active');
  tx.update(ref,{status:'paused',pausedBy:uid,pausedAt:timestamp()});
  audit(tx,space,uid,'sponsor_campaign_paused',ref.id);
 });
 return {paused:true,existingPassesRevoked:false};
});
