// Deterministic hotspot execution state machine.
// Payment and gateway evidence cannot be synthesized by the browser.
export const voucherTransitions=Object.freeze({
 draft:['pending_payment','issued','revoked'],
 pending_payment:['issued','revoked'],
 issued:['provision_pending','revoked','expired'],
 provision_pending:['provisioned','provision_failed','revoked'],
 provision_failed:['provision_pending','revoked'],
 provisioned:['active','revoked','expired'],
 active:['revoked','expired'],
 revoked:[],expired:[]
});
export function decideVoucherTransition({voucher,target,plan,site,payment,approvedBy,actorUid,now=Date.now()}){
 if(!voucher||!plan||!site||!voucherTransitions[voucher.state]?.includes(target))return {allowed:false,reason:'invalid_transition'};
 if(voucher.siteId!==site.id||voucher.planId!==plan.id||plan.siteId!==site.id)return {allowed:false,reason:'site_scope_mismatch'};
 if(!['issued','pending_payment','revoked','expired','provision_pending','provision_failed','provisioned','active'].includes(target))return {allowed:false,reason:'unsupported_target'};
 if(target==='revoked'||target==='expired')return {allowed:true,reason:'record_only'};
 if(plan.state!=='published'||site.state!=='commissioned')return {allowed:false,reason:'uncommissioned'};
 if(target==='pending_payment'&&plan.priceKes===0)return {allowed:false,reason:'free_plan'};
 if(target==='issued'&&plan.priceKes>0){
  if(!payment||payment.state!=='verified'||payment.receiptVerified!==true||!payment.verifiedAt||
     payment.voucherId!==voucher.id||payment.planId!==plan.id||payment.siteId!==site.id||
     payment.amountKes!==plan.priceKes)return {allowed:false,reason:'payment_not_verified'};
 }
 if(['provision_pending','provisioned','active'].includes(target)){
  if(site.gatewayVerified!==true)return {allowed:false,reason:'gateway_unverified'};
  if(typeof approvedBy!=='string'||!approvedBy||approvedBy===actorUid)return {allowed:false,reason:'independent_approval_required'};
 }
 if(target==='active')return {allowed:false,reason:'gateway_acknowledgement_required'};
 if(target==='provisioned')return {allowed:false,reason:'signed_gateway_receipt_required'};
 if(voucher.expiresAtMs!==undefined&&(!Number.isSafeInteger(voucher.expiresAtMs)||voucher.expiresAtMs<=now))return {allowed:false,reason:'expired'};
 return {allowed:true,reason:'preflight_only'};
}
export function normalizeGatewayReceipt({request,receipt,now=Date.now()}){
 if(!request||!receipt||request.state!=='pending'||typeof request.operation!=='string')return {verified:false,reason:'missing_request'};
 if(request.id!==receipt.requestId||request.siteId!==receipt.siteId||request.voucherId!==receipt.voucherId)return {verified:false,reason:'reference_mismatch'};
 if(!['provision','disconnect'].includes(request.operation)||receipt.operation!==request.operation)return {verified:false,reason:'operation_mismatch'};
 if(receipt.status!=='acknowledged'||receipt.attestedBy!=='trusted_gateway')return {verified:false,reason:'untrusted_receipt'};
 if(!Number.isSafeInteger(receipt.observedAtMs)||Math.abs(now-receipt.observedAtMs)>300000)return {verified:false,reason:'stale_receipt'};
 return {verified:true,reason:'receipt_shape_only_requires_transport_auth'};
}
