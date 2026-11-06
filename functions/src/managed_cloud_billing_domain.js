import {cloudPlanCatalog} from './managed_cloud_domain.js';
export function cloudPaymentDecision(order, provider){
 if(!order||!provider||provider.status!=='success')return {valid:false,reason:'not_successful'};
 if(provider.reference!==order.reference)return {valid:false,reason:'reference_mismatch'};
 if(provider.currency!=='KES'||provider.amount!==order.priceKes*100)
  return {valid:false,reason:'amount_or_currency_mismatch'};
 if(!Number.isSafeInteger(Number(provider.id))||!provider.paid_at)
  return {valid:false,reason:'missing_provider_receipt'};
 if(!Object.hasOwn(cloudPlanCatalog,order.plan)||cloudPlanCatalog[order.plan].priceKes!==order.priceKes)
  return {valid:false,reason:'price_mismatch'};
 return {valid:true,providerTransactionId:String(provider.id)};
}
export function isCloudServicePaid(payment,now=Date.now()){
 return Boolean(payment?.paymentEnvironment==='live'&&
  payment?.receiptVerified===true&&payment?.status==='paid'&&
  typeof payment.paidUntilMs==='number'&&payment.paidUntilMs>now);
}
