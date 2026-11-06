// Gateway authorization and reconciliation helpers; deterministic, pure and fail-closed.
import {radiusReplyPlan} from './hotspot_domain.js';
const valid=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{5,100}$/.test(x);
export function authorizedGatewayGrant({voucher,plan,site,payment}){
 if(!voucher||!plan||!site||!valid(voucher.siteId)||!valid(voucher.planId))return {allowed:false,reason:'missing_resource'};
 if(voucher.siteId!==site.id||voucher.planId!==plan.id||plan.siteId!==site.id)return {allowed:false,reason:'site_plan_mismatch'};
 if(site.status!=='active'||site.routerConnected!==true||site.gatewayVerified!==true)return {allowed:false,reason:'gateway_not_verified'};
 if(plan.status!=='active')return {allowed:false,reason:'plan_inactive'};
 if(voucher.status!=='issued'||voucher.redeemed===true)return {allowed:false,reason:'voucher_not_issued'};
 if(plan.priceKes>0&&(!payment||payment.status!=='verified'||payment.voucherId!==voucher.id||
     payment.siteId!==site.id||payment.planId!==plan.id||payment.expectedAmountKes!==plan.priceKes||
     payment.receiptVerified!==true))return {allowed:false,reason:'payment_not_verified'};
 if(voucher.expiresAtMs!==undefined&&(!Number.isSafeInteger(voucher.expiresAtMs)||Date.now()>=voucher.expiresAtMs))return {allowed:false,reason:'expired'};
 try{const limits=radiusReplyPlan(plan);return {allowed:true,reason:'policy_passed',limits};}
 catch{return {allowed:false,reason:'invalid_plan'};}
}
export function summarizeRadiusSessions(events){
 const latest=new Map();
 for(const event of events){
   if(!event||!valid(event.sessionId)||!valid(event.siteId)||!['start','interim','stop'].includes(event.type)||!Number.isSafeInteger(event.observedAtMs))continue;
   if(!Number.isSafeInteger(event.inputOctets)||event.inputOctets<0||!Number.isSafeInteger(event.outputOctets)||event.outputOctets<0)continue;
   const key=event.siteId+':'+event.sessionId,prior=latest.get(key);
   if(!prior||event.observedAtMs>prior.observedAtMs)latest.set(key,event);
 }
 const sessions=[...latest.values()];
 return {sampledSessions:sessions.length,latestInboundBytes:sessions.reduce((sum,e)=>sum+e.inputOctets,0),
 latestOutboundBytes:sessions.reduce((sum,e)=>sum+e.outputOctets,0),
 stoppedSessions:sessions.filter(e=>e.type==='stop').length,
 note:'Latest cumulative byte counters per session; excludes absent and rotated/rollover records. Sample limited; not financial-grade usage.'};
}
export function validateRouterosCredentialPlan({voucher,plan,site,payment,operatorApproved}){
 const grant=authorizedGatewayGrant({voucher,plan,site,payment});
 if(!grant.allowed)return {ready:false,reason:grant.reason};
 if(operatorApproved!==true)return {ready:false,reason:'operator_approval_required'};
 return {ready:true,reason:'preflight_only',sessionTimeoutSeconds:grant.limits.sessionTimeoutSeconds,
 uploadKbps:grant.limits.uploadKbps,downloadKbps:grant.limits.downloadKbps,
 executed:false,networkCredentialsCreated:false};
}
