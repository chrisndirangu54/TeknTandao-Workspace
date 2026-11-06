// Pure payment verification and authorization decision helpers.
// Provider responses must be re-queried server-side; browser callbacks are never authoritative.
export function reconcileHotspotMpesa({order,provider,receipt}){
 if(!order||!provider)return {verified:false,reason:'missing_evidence'};
 if(order.status!=='pending_verification')return {verified:false,reason:'order_not_pending'};
 if(typeof order.checkoutRequestId!=='string'||!order.checkoutRequestId)return {verified:false,reason:'missing_checkout'};
 if(String(provider.CheckoutRequestID||'')!==order.checkoutRequestId)return {verified:false,reason:'checkout_mismatch'};
 if(String(provider.ResultCode)!=='0')return {verified:false,reason:'provider_not_successful'};
 if(!receipt||receipt.source!=='verified_provider' || receipt.checkoutRequestId!==order.checkoutRequestId)return {verified:false,reason:'receipt_not_authoritative'};
 if(receipt.merchantAccount!==order.merchantAccount)return {verified:false,reason:'merchant_mismatch'};
 if(receipt.receiptNumber===undefined||typeof receipt.receiptNumber!=='string'||!/^[A-Za-z0-9]{8,30}$/.test(receipt.receiptNumber))return {verified:false,reason:'invalid_receipt'};
 if(!Number.isSafeInteger(order.amountKes)||order.amountKes<=0||receipt.amountKes!==order.amountKes)return {verified:false,reason:'amount_mismatch'};
 if(!order.voucherId||receipt.orderId!==order.id)return {verified:false,reason:'order_mismatch'};
 return {verified:true,reason:'provider_reconciled',receiptNumber:receipt.receiptNumber};
}
export function allowedHotspotOrderTransition(from,to){
 return Object.freeze({
   draft:['pending_verification','cancelled'],
   pending_verification:['verified','failed','cancelled','needs_review'],
   needs_review:['verified','failed','cancelled'],
   verified:['refunded','disputed'],
   failed:[],cancelled:[],refunded:[],disputed:[]
 })[from]?.includes(to)===true;
}
export function hotspotPaymentGate({order,plan,voucher}){
 if(!order||!plan||!voucher)return {allowed:false,reason:'missing_records'};
 if(order.status!=='verified'||order.receiptVerified!==true||!order.providerVerifiedAt)return {allowed:false,reason:'payment_unverified'};
 if(order.voucherId!==voucher.id||order.planId!==plan.id||order.siteId!==voucher.siteId)return {allowed:false,reason:'association_mismatch'};
 if(!Number.isSafeInteger(plan.priceKes)||order.amountKes!==plan.priceKes)return {allowed:false,reason:'amount_mismatch'};
 return {allowed:true,reason:'payment_eligible_only'};
}
