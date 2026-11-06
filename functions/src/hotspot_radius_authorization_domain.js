import {createHmac,timingSafeEqual} from 'node:crypto';
export function verifySignedRadiusRequest({raw,timestamp,signature,secret,now=Date.now()}){
 if(!Buffer.isBuffer(raw)||raw.length>4096||!secret||typeof timestamp!=='string'||
 !/^[0-9]{13}$/.test(timestamp)||typeof signature!=='string'||!/^[a-f0-9]{64}$/i.test(signature))return false;
 if(Math.abs(now-Number(timestamp))>60000)return false;
 const expected=createHmac('sha256',secret).update(timestamp).update('.').update(raw).digest();
 return timingSafeEqual(expected,Buffer.from(signature,'hex'));
}
export function evaluateRadiusAccess({site,plan,voucher,payment,providedCode,now=Date.now()}){
 const denied=reason=>({authorized:false,reason});
 if(!site||!plan||!voucher)return denied('missing_records');
 if(site.state!=='commissioned'||site.gatewayVerified!==true||site.radiusEnabled!==true)return denied('gateway_unverified');
 if(plan.state!=='published'||plan.siteId!==site.id||voucher.planId!==plan.id||voucher.siteId!==site.id)return denied('mismatched_scope');
 if(!['provisioned','active'].includes(voucher.state)||voucher.redeemed===true||voucher.gatewayProvisioned!==true)return denied('voucher_not_provisioned');
 if(!Number.isSafeInteger(voucher.expiresAtMs)||voucher.expiresAtMs-now<1000)return denied('expired_or_missing_expiry');
 if(typeof providedCode!=='string'||!/^[A-Fa-f0-9]{32}$/.test(providedCode)||typeof voucher.secretSalt!=='string'||!/^[a-f0-9]{32}$/.test(voucher.secretSalt)||typeof voucher.secretHash!=='string'||!/^[a-f0-9]{64}$/.test(voucher.secretHash))return denied('invalid_credentials');
 const actual=createHmac('sha256',Buffer.from(voucher.secretSalt,'hex')).update(providedCode.toUpperCase()).digest();
 if(!timingSafeEqual(actual,Buffer.from(voucher.secretHash,'hex')))return denied('incorrect_credentials');
 if(!Number.isSafeInteger(plan.priceKes)||plan.priceKes<0)return denied('invalid_price');
 if(plan.priceKes>0&&(!payment||payment.state!=='verified'||payment.receiptVerified!==true||!payment.providerVerifiedAt||
 payment.voucherId!==voucher.id||payment.siteId!==site.id||payment.planId!==plan.id||payment.amountKes!==plan.priceKes))return denied('unverified_settlement');
 if(!Number.isSafeInteger(plan.durationMinutes)||plan.durationMinutes<1||plan.durationMinutes>525600||
 !Number.isSafeInteger(plan.uploadMbps)||plan.uploadMbps<1||plan.uploadMbps>10000||
 !Number.isSafeInteger(plan.downloadMbps)||plan.downloadMbps<1||plan.downloadMbps>10000)
 return denied('invalid_limits');
 return {authorized:true,reason:'policy_passed',attributes:{'Session-Timeout':Math.max(1,Math.min(plan.durationMinutes*60,Math.floor((voucher.expiresAtMs-now)/1000))),
 'Mikrotik-Rate-Limit':plan.uploadMbps+'M/'+plan.downloadMbps+'M'}};
}
