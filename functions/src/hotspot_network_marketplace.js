// Opt-in, cross-tenant hotspot advertising INVENTORY registry and planning.
// The coordinating operator is explicitly configured. No live advertiser
// charges, paid impressions, commissions, payouts or conversion claims.
import {randomUUID} from 'node:crypto';
import {getFirestore,FieldValue} from 'firebase-admin/firestore';
import {onCall,HttpsError} from 'firebase-functions/v2/https';
import {defineString} from 'firebase-functions/params';
import {allocatePreview,splitTestBudget,measurePilot,riskFlags,validateShare} from './hotspot_network_ads_domain.js';
const centralOrg=defineString('HOTSPOT_AD_NETWORK_ADMIN_ORG',{default:''});
const db=()=>getFirestore(),org=id=>db().collection('organizations').doc(id);
const root=id=>org(id).collection('hotspotV2').doc('control');
const network=()=>db().collection('hotspotAdvertisingNetwork');
const siteIndex=()=>db().collection('hotspotAdvertisingSiteIndex');
const fail=(c,m)=>{throw new HttpsError(c,m);};
const id=x=>typeof x==='string'&&/^[a-zA-Z0-9_-]{5,100}$/.test(x);
const shape=(o,keys)=>o&&typeof o==='object'&&!Array.isArray(o)&&Object.keys(o).every(x=>keys.includes(x));
const callable=fn=>onCall({region:'europe-west1',timeoutSeconds:60,enforceAppCheck:true},fn);
function auth(req){if(!req.auth)fail('unauthenticated','Sign in required');}
async function role(req,orgId){
 auth(req);if(!id(orgId))fail('invalid-argument','Organization ID invalid');
 const m=await org(orgId).collection('members').doc(req.auth.uid).get();
 if(!m.exists||!['owner','admin'].includes(m.data()?.role))
  fail('permission-denied','Organization admin required');
}
async function networkAdmin(req){
 const configured=centralOrg.value();if(!id(configured))
  fail('failed-precondition','Network administrative organization not configured');
 await role(req,configured);
 return configured;
}
function safeInventory(doc){
 const d=doc.data();return {registryId:doc.id,orgId:d.orgId,siteId:d.siteId,
 category:d.category,capacityDaily:d.capacityDaily,activeUniqueDays:d.activeUniqueDays,
 verifiedAvailabilityPct:d.verifiedAvailabilityPct,ownerOptIn:d.ownerOptIn===true,
 approved:d.approved===true,gatewayVerified:d.gatewayVerified===true,labOnly:d.labOnly===true};
}
export const hotspotNetworkOptInSite=callable(async req=>{
 if(!shape(req.data,['orgId','siteId','category','capacityDaily','termsAccepted'])||
 !id(req.data?.orgId)||!id(req.data?.siteId)||req.data.termsAccepted!==true||
 !['hostel','residential','retail','transport','campus','event','other'].includes(req.data.category)||
 !Number.isSafeInteger(req.data.capacityDaily)||req.data.capacityDaily<1||req.data.capacityDaily>100000)
 fail('invalid-argument','Invalid site opt-in');
 await role(req,req.data.orgId);
 const siteRef=root(req.data.orgId).collection('sites').doc(req.data.siteId);
 const indexId=req.data.orgId+'_'+req.data.siteId;
 if(indexId.length>201)fail('invalid-argument','Site index too long');
 const ref=siteIndex().doc(indexId),registry=network().doc(indexId);
 await db().runTransaction(async tx=>{
  const [site,existing]=await Promise.all([tx.get(siteRef),tx.get(ref)]);
  if(!site.exists||site.data().state!=='commissioned'||site.data().gatewayVerified!==true||
   site.data().labOnly!==true)fail('failed-precondition','Commissioned lab site required');
  if(existing.exists&&existing.data().status!=='withdrawn')
   fail('already-exists','Inventory is already submitted');
  const item={orgId:req.data.orgId,siteId:req.data.siteId,
   category:req.data.category,capacityDaily:req.data.capacityDaily,
   activeUniqueDays:0,verifiedAvailabilityPct:0,
   ownerOptIn:true,approved:false,gatewayVerified:true,labOnly:true,
   status:'pending_review',submittedBy:req.auth.uid,
   submittedAt:FieldValue.serverTimestamp(),
   networkShareBps:7000};
  tx.set(ref,{orgId:req.data.orgId,siteId:req.data.siteId,status:'pending_review'});
  tx.set(registry,item);
 });
 return {registryId:indexId,status:'pending_review',liveAdvertising:false};
});
export const hotspotNetworkReviewSite=callable(async req=>{
 if(!shape(req.data,['registryId','decision','verifiedAvailabilityPct','activeUniqueDays'])||
 typeof req.data?.registryId!=='string'||req.data.registryId.length>201||
 !['approve','reject'].includes(req.data.decision)||
 !Number.isSafeInteger(req.data.verifiedAvailabilityPct)||req.data.verifiedAvailabilityPct<0||
 req.data.verifiedAvailabilityPct>100||!Number.isSafeInteger(req.data.activeUniqueDays)||
 req.data.activeUniqueDays<0||req.data.activeUniqueDays>365)
 fail('invalid-argument','Invalid review');
 await networkAdmin(req);const ref=network().doc(req.data.registryId);
 await db().runTransaction(async tx=>{
  const item=await tx.get(ref);
  if(!item.exists||item.data().status!=='pending_review'||item.data().submittedBy===req.auth.uid)
   fail('failed-precondition','Separate reviewer and pending inventory required');
  const site=await tx.get(root(item.data().orgId).collection('sites').doc(item.data().siteId));
  if(!site.exists||site.data().gatewayVerified!==true||site.data().labOnly!==true||
   site.data().state!=='commissioned')fail('failed-precondition','Site lost approval');
  const status=req.data.decision==='approve'?'approved':'rejected';
  tx.update(ref,{status,approved:status==='approved',verifiedAvailabilityPct:req.data.verifiedAvailabilityPct,
    activeUniqueDays:req.data.activeUniqueDays,reviewedBy:req.auth.uid,
    reviewedAt:FieldValue.serverTimestamp(),reviewEvidenceType:'operator_attestation_unverified'});
 });
 return {reviewed:true,siteStatus:req.data.decision,liveAdvertising:false};
});
export const hotspotNetworkWithdrawSite=callable(async req=>{
 if(!shape(req.data,['orgId','siteId'])||!id(req.data?.orgId)||!id(req.data?.siteId))
 fail('invalid-argument','Invalid inventory');
 await role(req,req.data.orgId);
 const registry=network().doc(req.data.orgId+'_'+req.data.siteId);
 await db().runTransaction(async tx=>{
  const current=await tx.get(registry);
  if(!current.exists||current.data().orgId!==req.data.orgId)fail('not-found','Site missing');
  tx.update(registry,{status:'withdrawn',approved:false,ownerOptIn:false,
   withdrawnAt:FieldValue.serverTimestamp()});
 });
 return {withdrawn:true,futureInventoryRemoved:true};
});
export const hotspotNetworkInventory=callable(async req=>{
 if(!shape(req.data,['status'])||!['approved','pending_review','all'].includes(req.data.status))
 fail('invalid-argument','Invalid inventory query');
 await networkAdmin(req);
 const snap=await network().limit(100).get();
 return {inventory:snap.docs.filter(d=>req.data.status==='all'||d.data().status===req.data.status)
  .map(d=>({...safeInventory(d),status:d.data().status})),limitedTo:100,
  evidence:'Site availability inputs are reviewer attestations, not live measurements'};
});
export const hotspotNetworkCampaignPreview=callable(async req=>{
 if(!shape(req.data,['budgetKes','category','maxLocations','operatorShareBps'])||
 !Number.isSafeInteger(req.data?.budgetKes)||req.data.budgetKes<0||
 req.data.budgetKes>5000000||
 !['all','hostel','residential','retail','transport','campus','event','other'].includes(req.data.category)||
 !Number.isSafeInteger(req.data.maxLocations)||req.data.maxLocations<1||req.data.maxLocations>100||
 !validateShare(req.data.operatorShareBps))fail('invalid-argument','Invalid planning input');
 await networkAdmin(req);
 const docs=await network().limit(100).get();
 const sites=docs.docs.map(safeInventory);
 const allocation=allocatePreview({sites,budgetKes:req.data.budgetKes,
  maxLocations:req.data.maxLocations,category:req.data.category})
  .map(a=>({...a,proposedSplit:splitTestBudget(a.proposedKes,req.data.operatorShareBps)}));
 return {placements:allocation,split:splitTestBudget(req.data.budgetKes,req.data.operatorShareBps),
  sourceSitesScanned:sites.length,requiresIndependentEvidence:true,
  executable:false,advertiserCharged:false,operatorPaid:false,
  limitation:'This is a planning preview; no ad impression billing or settlement'};
});

export const hotspotNetworkCreatePilot=callable(async req=>{
 if(!shape(req.data,['title','budgetKes','category','maxLocations','operatorShareBps'])||
 typeof req.data?.title!=='string'||req.data.title.trim().length<5||
 req.data.title.length>120||!Number.isSafeInteger(req.data.budgetKes)||
 req.data.budgetKes<0||req.data.budgetKes>5000000||
 !['all','hostel','residential','retail','transport','campus','event','other'].includes(req.data.category)||
 !Number.isSafeInteger(req.data.maxLocations)||req.data.maxLocations<1||
 req.data.maxLocations>100||!validateShare(req.data.operatorShareBps))
 fail('invalid-argument','Invalid pilot campaign');
 await networkAdmin(req);
 const docs=await network().limit(100).get();
 const allocations=allocatePreview({sites:docs.docs.map(safeInventory),
  budgetKes:req.data.budgetKes,category:req.data.category,maxLocations:req.data.maxLocations})
  .map(a=>({...a,proposedSplit:splitTestBudget(a.proposedKes,req.data.operatorShareBps)}));
 if(!allocations.length)fail('failed-precondition','No eligible approved locations');
 const ref=db().collection('hotspotAdvertisingPilots').doc(randomUUID());
 await ref.create({title:req.data.title.trim(),category:req.data.category,
  proposedBudgetKes:req.data.budgetKes,operatorShareBps:req.data.operatorShareBps,
  allocations,proposalOnly:true,advertiserCharged:false,operatorPaid:false,
  settledKes:0,liveDeliveryEnabled:false,state:'draft',
  createdBy:req.auth.uid,createdAt:FieldValue.serverTimestamp(),
  evidence:'Reviewer-attested capacity, not verified ad inventory'});
 return {pilotId:ref.id,locations:allocations.length,status:'draft',
  paymentsEnabled:false,adServingEnabled:false};
});
export const hotspotNetworkPilotDashboard=callable(async req=>{
 if(!shape(req.data,['pilotId'])||!id(req.data?.pilotId))
 fail('invalid-argument','Invalid pilot');
 await networkAdmin(req);
 const ref=db().collection('hotspotAdvertisingPilots').doc(req.data.pilotId);
 const snap=await ref.get();if(!snap.exists)fail('not-found','Pilot unavailable');
 const p=snap.data();
 const rows=p.allocations.map(a=>({
  registryId:a.registryId,orgId:a.orgId,siteId:a.siteId,
  sessionsIssued:0,gatewayAccepts:0,verifiedRedemptions:0
 }));
 return {pilotId:snap.id,state:p.state,locations:p.allocations.length,
  budgetProposalKes:p.proposedBudgetKes,
  allocations:p.allocations,
  measurements:measurePilot(rows),riskFlags:riskFlags(),
  liveCampaign:false,verifiedImpressions:0,operatorPayoutsKes:0,
  sponsorSettledKes:0,conversionLift:null,
  explanation:'No verified cross-operator ad events or payment ledger connected to this proposal'};
});
export const hotspotNetworkPortfolio=callable(async req=>{
 if(!shape(req.data,[]))fail('invalid-argument','Unexpected request');
 await networkAdmin(req);
 const [sites,pilots]=await Promise.all([network().limit(100).get(),
  db().collection('hotspotAdvertisingPilots').limit(50).get()]);
 const all=sites.docs.map(safeInventory);
 return {locations:all.length,approvedLocations:all.filter(s=>s.approved&&s.ownerOptIn).length,
  proposals:pilots.size,productionCampaigns:0,verifiedImpressions:0,
  advertiserRevenueKes:0,payableOperatorRevenueKes:0,
  warning:'Network inventory is a lab pilot; no real advertiser funds or verified impression billing'};
});
