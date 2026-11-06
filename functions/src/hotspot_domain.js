// Pure hotspot policy and session normalization. No side effects.
import {createHmac,timingSafeEqual} from 'node:crypto';
const validId=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{5,100}$/.test(x);
export function hotspotVoucherEligibility({voucher,site,plan,paid=false,now=Date.now()}){
 if(!voucher||!site||!plan||!validId(voucher.siteId)||!validId(voucher.planId))return {eligible:false,reason:'missing_reference'};
 if(voucher.status!=='unissued'||voucher.redeemed===true)return {eligible:false,reason:'inactive_voucher'};
 if(voucher.siteId!==site.id||voucher.planId!==plan.id)return {eligible:false,reason:'reference_mismatch'};
 if(site.status!=='active'||plan.status!=='active')return {eligible:false,reason:'unpublished_site_or_plan'};
 if(plan.priceKes>0&&!paid)return {eligible:false,reason:'unverified_payment'};
 if(!Number.isSafeInteger(plan.durationMinutes)||plan.durationMinutes<1||plan.durationMinutes>525600)return {eligible:false,reason:'invalid_duration'};
 if(!Number.isSafeInteger(plan.downloadMbps)||plan.downloadMbps<1||!Number.isSafeInteger(plan.uploadMbps)||plan.uploadMbps<1)return {eligible:false,reason:'invalid_bandwidth'};
 if(voucher.expiresAtMs!==undefined&&(!Number.isSafeInteger(voucher.expiresAtMs)||now>=voucher.expiresAtMs))return {eligible:false,reason:'expired'};
 return {eligible:true,reason:'policy_passed_not_provisioned'};
}
export function radiusReplyPlan(plan){
 if(!plan||!Number.isSafeInteger(plan.durationMinutes)||plan.durationMinutes<1||plan.durationMinutes>525600||!Number.isSafeInteger(plan.downloadMbps)||plan.downloadMbps<1||plan.downloadMbps>10000||!Number.isSafeInteger(plan.uploadMbps)||plan.uploadMbps<1||plan.uploadMbps>10000||!Number.isSafeInteger(plan.maxDevices)||plan.maxDevices<1||plan.maxDevices>100)throw new Error('Invalid hotspot plan');
 return Object.freeze({sessionTimeoutSeconds:plan.durationMinutes*60,downloadKbps:plan.downloadMbps*1000,uploadKbps:plan.uploadMbps*1000,maxDevices:plan.maxDevices,requiresGatewayAdapter:true});
}
export function normalizeRadiusAccounting(input){
 if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(x=>!['eventId','siteId','sessionId','usernameRef','type','inputOctets','outputOctets','observedAtMs','nasId'].includes(x)))throw new Error('Unexpected accounting fields');
 for(const key of ['eventId','siteId','sessionId','usernameRef','nasId'])if(!validId(input[key]))throw new Error('Invalid accounting ID');
 if(!['start','interim','stop'].includes(input.type))throw new Error('Invalid accounting type');
 for(const key of ['inputOctets','outputOctets','observedAtMs'])if(!Number.isSafeInteger(input[key])||input[key]<0)throw new Error('Invalid accounting value');
 if(input.observedAtMs>Date.now()+300000||input.observedAtMs<Date.now()-7*86400000)throw new Error('Stale accounting event');
 return Object.freeze({...input,source:'radius_collector',verified:false});
}
export function verifyCollectorSignature(raw,signature,secret){
 if(typeof raw!=='string'||!secret||typeof signature!=='string'||!/^[a-f0-9]{64}$/i.test(signature))return false;
 const expected=createHmac('sha256',secret).update(raw).digest();
 return timingSafeEqual(expected,Buffer.from(signature,'hex'));
}
export function radiusProfileForMikrotik({username,profile,realm='hotspot'}){
 if(typeof username!=='string'||!/^[A-Za-z0-9_-]{5,64}$/.test(username)||typeof realm!=='string'||!/^[a-z0-9_-]{1,30}$/.test(realm))throw new Error('Invalid RADIUS identity');
 const p=radiusReplyPlan(profile);
 // MikroTik rate-limit direction is upload/download; keep conversion explicit.
 return {username:username+'@'+realm,attributes:{'Session-Timeout':p.sessionTimeoutSeconds,'Mikrotik-Rate-Limit':p.uploadKbps+'k/'+p.downloadKbps+'k'},maxDevices:p.maxDevices,provisioned:false};
}
