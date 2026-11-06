// Sponsored hotspot marketplace. Advertisers are explicitly approved per
// operator; payments are Paystack TEST ONLY, verified server-to-server.
// No PII-based microtargeting, no ad network identifiers or live payouts.
import {randomUUID,randomBytes,createHash,createHmac} from 'node:crypto';
import {getFirestore,FieldValue} from 'firebase-admin/firestore';
import {onCall,HttpsError} from 'firebase-functions/v2/https';
import {defineSecret} from 'firebase-functions/params';
import {initializePaystack,verifyTransaction} from './providers.js';
import {validateSponsorInput,validateAdTargeting,selectLocalAds} from './hotspot_advertising_domain.js';
const paystackKey=defineSecret('HOTSPOT_PAYSTACK_TEST_SECRET');
const fail=(code,msg)=>{throw new HttpsError(code,msg);};
const id=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{5,100}$/.test(x);
const shape=(data,fields)=>{if(!data||typeof data!=='object'||Array.isArray(data)||Object.keys(data).some(x=>!fields.includes(x)))fail('invalid-argument','Invalid fields');};
const db=()=>getFirestore(),org=x=>db().collection('organizations').doc(x);
const root=x=>org(x).collection('hotspotV2').doc('control');
const call=fn=>onCall({region:'europe-west1',timeoutSeconds:60,enforceAppCheck:true},fn);
const paidCall=fn=>onCall({region:'europe-west1',timeoutSeconds:60,enforceAppCheck:true,secrets:[paystackKey]},fn);
const key=()=>{const x=paystackKey.value();if(typeof x!=='string'||!x.startsWith('sk_test_'))fail('failed-precondition','Test merchant unavailable');return x;};
function authenticated(req){if(!req.auth||!id(req.data?.orgId))fail('unauthenticated','Workspace and sign-in required');}
async function admin(req){
 authenticated(req);const membership=await org(req.data.orgId).collection('members').doc(req.auth.uid).get();
 if(!membership.exists||!['owner','admin'].includes(membership.data()?.role))fail('permission-denied','Operator administrator required');
 return root(req.data.orgId);
}
async function advertiser(req){
 authenticated(req);const doc=root(req.data.orgId).collection('sponsors').doc(req.auth.uid);
 const snap=await doc.get();
 if(!snap.exists||snap.data().status!=='approved')fail('permission-denied','Sponsor approval required');
 return {space:root(req.data.orgId),sponsor:snap.data()};
}
const audit=(tx,space,actor,action,target)=>tx.create(space.collection('audit').doc(randomUUID()),
 {actor,action,target,at:FieldValue.serverTimestamp()});
const safeCampaign=d=>({id:d.id,title:d.data().title,advertiser:d.data().advertiser,
 creativeUrl:d.data().creativeUrl,destinationUrl:d.data().destinationUrl,
 siteIds:d.data().siteIds,interestTags:d.data().interestTags,status:d.data().status,
 startsAtMs:d.data().startsAtMs,endsAtMs:d.data().endsAtMs,
 rewardLimit:d.data().rewardLimit,rewardedCount:d.data().rewardedCount,
 fundingVerified:d.data().fundingVerified===true,billingMode:d.data().billingMode});

export const hotspotV2SponsorApply=call(async req=>{
 shape(req.data,['orgId','businessName','contactEmail','contactPhone','termsAccepted']);
 authenticated(req);
 if(req.data.termsAccepted!==true||!validateSponsorInput(req.data).ok)fail('invalid-argument','Business contact and terms required');
 const space=root(req.data.orgId),ref=space.collection('sponsors').doc(req.auth.uid);
 await db().runTransaction(async tx=>{
  const old=await tx.get(ref);if(old.exists)fail('already-exists','Sponsor application already exists');
  tx.create(ref,{uid:req.auth.uid,businessName:req.data.businessName.trim(),
   contactEmail:req.data.contactEmail.trim().toLowerCase(),contactPhoneLast4:req.data.contactPhone.slice(-4),
   status:'pending_review',termsAccepted:true,createdAt:FieldValue.serverTimestamp()});
  audit(tx,space,req.auth.uid,'sponsor_applied',req.auth.uid);
 });
 return {status:'pending_review',testPaymentsEnabled:false};
});
export const hotspotV2SponsorApprove=call(async req=>{
 shape(req.data,['orgId','sponsorUid']);const space=await admin(req);
 if(typeof req.data.sponsorUid!=='string'||req.data.sponsorUid.length>128)fail('invalid-argument','Invalid sponsor');
 const ref=space.collection('sponsors').doc(req.data.sponsorUid);
 await db().runTransaction(async tx=>{
  const s=await tx.get(ref);
  if(!s.exists||s.data().status!=='pending_review'||req.auth.uid===req.data.sponsorUid)
   fail('failed-precondition','Independent sponsor review required');
  tx.update(ref,{status:'approved',reviewedBy:req.auth.uid,reviewedAt:FieldValue.serverTimestamp()});
  audit(tx,space,req.auth.uid,'sponsor_approved',req.data.sponsorUid);
 });
 return {approved:true};
});
export const hotspotV2SponsorListApplicants=call(async req=>{
 shape(req.data,['orgId']);const space=await admin(req);
 const snap=await space.collection('sponsors').limit(100).get();
 return {applicants:snap.docs.map(d=>({uid:d.id,businessName:d.data().businessName,
  status:d.data().status,contactEmail:d.data().contactEmail}))};
});
export const hotspotV2SponsorCreateCampaign=call(async req=>{
 shape(req.data,['orgId','siteIds','planId','title','creativeUrl','destinationUrl',
 'interestTags','startsAtMs','endsAtMs','rewardLimit','budgetKes']);
 const {space,sponsor}=await advertiser(req),d=req.data;
 const valid=validateAdTargeting(d);
 if(!valid.ok||!id(d.planId)||!Number.isSafeInteger(d.rewardLimit)||d.rewardLimit<1||d.rewardLimit>5000||
 !Number.isSafeInteger(d.budgetKes)||d.budgetKes<100||d.budgetKes>100000||
 typeof d.title!=='string'||d.title.trim().length<4||d.title.length>100||
 typeof d.creativeUrl!=='string'||!/^https:\/\//.test(d.creativeUrl)||d.creativeUrl.length>1000||
 typeof d.destinationUrl!=='string'||!/^https:\/\//.test(d.destinationUrl)||d.destinationUrl.length>1000)
 fail('invalid-argument','Invalid sponsored campaign');
 // One plan/site per campaign: location targeting is via separately approved
 // campaigns. This prevents accidental cross-site voucher associations.
 if(d.siteIds.length!==1)fail('invalid-argument','One approved hotspot site per campaign');
 const siteId=d.siteIds[0],ref=space.collection('sponsorCampaigns').doc(randomUUID());
 await db().runTransaction(async tx=>{
  const [site,plan]=await Promise.all([tx.get(space.collection('sites').doc(siteId)),
   tx.get(space.collection('plans').doc(d.planId))]);
  if(!site.exists||!plan.exists||site.data().state!=='commissioned'||site.data().labOnly!==true||
   plan.data().siteId!==site.id||plan.data().state!=='published'||plan.data().priceKes!==0||
   plan.data().durationMinutes!==30||plan.data().downloadMbps>2||plan.data().maxDevices!==1)
   fail('failed-precondition','Published 30-minute limited free lab plan required');
  tx.create(ref,{sponsorUid:req.auth.uid,siteId,siteIds:d.siteIds,planId:d.planId,
   advertiser:sponsor.businessName,title:d.title.trim(),creativeUrl:d.creativeUrl,
   destinationUrl:d.destinationUrl,interestTags:d.interestTags,
   startsAtMs:d.startsAtMs,endsAtMs:d.endsAtMs,rewardLimit:d.rewardLimit,
   rewardedCount:0,budgetKes:d.budgetKes,billingMode:'prepaid_test',
   fundingVerified:false,status:'awaiting_payment',operatorApproved:false,
   createdBy:req.auth.uid,createdAt:FieldValue.serverTimestamp(),minDwellSeconds:15});
  audit(tx,space,req.auth.uid,'sponsor_campaign_submitted',ref.id);
 });
 return {campaignId:ref.id,status:'awaiting_payment',testMode:true};
});
export const hotspotV2SponsorStartPaymentTest=paidCall(async req=>{
 shape(req.data,['orgId','campaignId']);const {space,sponsor}=await advertiser(req);
 if(!id(req.data.campaignId))fail('invalid-argument','Invalid campaign');
 const campaignRef=space.collection('sponsorCampaigns').doc(req.data.campaignId);
 const paymentRef=space.collection('sponsorPayments').doc(req.data.campaignId);
 const reference='HSA'+randomBytes(12).toString('hex');
 let amountKes;
 await db().runTransaction(async tx=>{
  const [campaign,existing]=await Promise.all([tx.get(campaignRef),tx.get(paymentRef)]);
  if(!campaign.exists||campaign.data().sponsorUid!==req.auth.uid||
   campaign.data().status!=='awaiting_payment'||existing.exists)
   fail('failed-precondition','No new test checkout permitted');
  amountKes=campaign.data().budgetKes;
  tx.create(paymentRef,{campaignId:campaignRef.id,sponsorUid:req.auth.uid,
    amountKes,reference,state:'initiating',provider:'paystack_test',
    customerEmailHash:createHash('sha256').update(sponsor.contactEmail).digest('hex'),
    createdAt:FieldValue.serverTimestamp()});
 });
 try{
  const result=await initializePaystack({secret:key(),email:sponsor.contactEmail,
   amount:amountKes*100,reference});
  await paymentRef.update({state:'pending_verification',updatedAt:FieldValue.serverTimestamp()});
  return {reference,authorizationUrl:result.authorization_url,
   environment:'test',chargeVerified:false};
 }catch{
  await paymentRef.update({state:'initiation_unknown',updatedAt:FieldValue.serverTimestamp()});
  fail('unavailable','Payment initiation uncertain. Reconcile reference before retrying');
 }
});
async function reconcile(space,campaignId,actorLabel,secret){
 const ref=space.collection('sponsorPayments').doc(campaignId);
 const snapshot=await ref.get();
 if(!snapshot.exists||snapshot.data().provider!=='paystack_test')
  fail('failed-precondition','Sponsor checkout not found');
 if(snapshot.data().state==='verified')return {verified:true,alreadyVerified:true};
 if(!['pending_verification','initiation_unknown'].includes(snapshot.data().state))
  fail('failed-precondition','Invalid payment state');
 let result;try{result=await verifyTransaction(secret,snapshot.data().reference);}
 catch{fail('unavailable','Provider verification failed');}
 const order=snapshot.data();
 if(result?.domain!=='test'||result?.status!=='success'||result?.currency!=='KES'||
  result?.reference!==order.reference||!Number.isSafeInteger(result?.amount)||
  result.amount!==order.amountKes*100||
  typeof result?.customer?.email!=='string'||
  createHash('sha256').update(result.customer.email.trim().toLowerCase()).digest('hex')!==order.customerEmailHash)
 return {verified:false,reason:'provider_amount_currency_identity_or_environment_mismatch'};
 const index=db().collection('hotspotSponsorPaymentReferences').doc(order.reference);
 const campaign=space.collection('sponsorCampaigns').doc(campaignId);
 await db().runTransaction(async tx=>{
  const [current,camp,prior]=await Promise.all([tx.get(ref),tx.get(campaign),tx.get(index)]);
  if(!current.exists||current.data().reference!==order.reference||
    !['pending_verification','initiation_unknown'].includes(current.data().state)||
    !camp.exists||camp.data().status!=='awaiting_payment'||
    camp.data().budgetKes!==order.amountKes||camp.data().sponsorUid!==order.sponsorUid||
    prior.exists)fail('aborted','Order already settled or changed');
  tx.create(index,{campaignId,reference:order.reference,recordedAt:FieldValue.serverTimestamp()});
  tx.update(ref,{state:'verified',verifiedAt:FieldValue.serverTimestamp()});
  tx.update(campaign,{fundingVerified:true,status:'awaiting_review',
    fundedAt:FieldValue.serverTimestamp()});
  audit(tx,space,actorLabel,'sponsor_payment_verified_test',campaignId);
 });
 return {verified:true,campaignStatus:'awaiting_review',productionPayment:false};
}
export const hotspotV2SponsorVerifyPaymentTest=paidCall(async req=>{
 shape(req.data,['orgId','campaignId']);
 const {space}=await advertiser(req);
 if(!id(req.data.campaignId))fail('invalid-argument','Invalid campaign');
 const campaign=await space.collection('sponsorCampaigns').doc(req.data.campaignId).get();
 if(!campaign.exists||campaign.data().sponsorUid!==req.auth.uid)
 fail('permission-denied','Not sponsor campaign owner');
 return reconcile(space,req.data.campaignId,req.auth.uid,key());
});
export const hotspotV2SponsorActivateCampaign=call(async req=>{
 shape(req.data,['orgId','campaignId']);const space=await admin(req);
 if(!id(req.data.campaignId))fail('invalid-argument','Invalid campaign');
 const ref=space.collection('sponsorCampaigns').doc(req.data.campaignId);
 await db().runTransaction(async tx=>{
  const camp=await tx.get(ref);
  if(!camp.exists||camp.data().status!=='awaiting_review'||camp.data().fundingVerified!==true||
    camp.data().createdBy===req.auth.uid)fail('failed-precondition','Independently verified funding and approval required');
  const [site,plan]=await Promise.all([tx.get(space.collection('sites').doc(camp.data().siteId)),
    tx.get(space.collection('plans').doc(camp.data().planId))]);
  if(!site.exists||!plan.exists||site.data().gatewayVerified!==true||site.data().labOnly!==true||
   plan.data().state!=='published'||plan.data().priceKes!==0||plan.data().siteId!==site.id)
   fail('failed-precondition','Commissioned site and free plan required');
  tx.update(ref,{status:'active',operatorApproved:true,approvedBy:req.auth.uid,
    approvedAt:FieldValue.serverTimestamp()});
  audit(tx,space,req.auth.uid,'paid_sponsor_campaign_approved',ref.id);
 });
 return {active:true,testFunded:true,realSponsorCharge:false};
});
export const hotspotV2LocalAdCatalog=call(async req=>{
 shape(req.data,['orgId','siteId','interestTags','personalizationConsent']);
 authenticated(req);
 if(!id(req.data.siteId)||!Array.isArray(req.data.interestTags)||req.data.interestTags.length>5||
 typeof req.data.personalizationConsent!=='boolean')fail('invalid-argument','Invalid targeting request');
 const space=root(req.data.orgId),site=await space.collection('sites').doc(req.data.siteId).get();
 if(!site.exists||site.data().gatewayVerified!==true||site.data().labOnly!==true)
 fail('not-found','Location unavailable');
 const docs=await space.collection('sponsorCampaigns').where('siteId','==',req.data.siteId).limit(80).get();
 const selected=selectLocalAds({campaigns:docs.docs.map(d=>({id:d.id,...d.data()})),
   siteId:req.data.siteId,interests:req.data.interestTags,personalizationConsent:req.data.personalizationConsent});
 return {campaigns:selected.map(c=>({id:c.id,title:c.title,advertiser:c.advertiser,
  creativeUrl:c.creativeUrl,destinationUrl:c.destinationUrl,planId:c.planId,
  durationMinutes:30})),personalizationApplied:req.data.personalizationConsent,
  privacy:'Only voluntarily supplied broad-interest categories are used. No persistent individual profile.'};
});
export const hotspotV2SponsorMyCampaigns=call(async req=>{
 shape(req.data,['orgId']);const {space}=await advertiser(req);
 const docs=await space.collection('sponsorCampaigns').where('sponsorUid','==',req.auth.uid).limit(50).get();
 return {campaigns:docs.docs.map(safeCampaign),limit:50};
});

export const hotspotV2SponsorAdminCampaigns=call(async req=>{
 shape(req.data,['orgId']);const space=await admin(req);
 const campaigns=await space.collection('sponsorCampaigns').limit(100).get();
 return {campaigns:campaigns.docs.map(safeCampaign),limit:100,
  note:'Test-funded sponsorship is not live revenue.'};
});
