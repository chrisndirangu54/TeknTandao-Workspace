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

/**
 * A single payment entitlement works with any registered cloud provider.
 * A paid subscription does not settle the underlying cloud-provider invoice.
 */
export function decideManagedCloudDeployment({project,billing,branch,cloudProvider,now=Date.now()}={}){
 if(!project||!cloudProvider||typeof project.cloudProvider!=='string')
  return {authorized:false,reason:'unknown_project_or_provider'};
 if(!Object.hasOwn(({
  gcp_cloud_run:true,aws_apprunner:true,azure_container_apps:true,
  digitalocean_app_platform:true,cloudflare_pages:true,railway:true,render:true
 }),cloudProvider))
  return {authorized:false,reason:'provider_not_supported'};
 if(project.cloudProvider!==cloudProvider||project.branch!==branch)
  return {authorized:false,reason:'source_or_provider_mismatch'};
 if(!isCloudServicePaid(billing,now))
  return {authorized:false,reason:'subscription_not_paid_or_expired'};
 return {authorized:true,provider:cloudProvider,paidUntilMs:billing.paidUntilMs};
}
