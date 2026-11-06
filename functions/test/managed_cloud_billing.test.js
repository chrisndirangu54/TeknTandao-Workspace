import test from 'node:test';
import assert from 'node:assert/strict';
import {cloudPaymentDecision,isCloudServicePaid} from '../src/managed_cloud_billing_domain.js';
import {managedCloudProviders,cloudPlanCatalog,serviceSchema} from '../src/managed_cloud_domain.js';

test('major providers are present in the extensible adapter catalogue',()=>{
 for(const id of ['gcp_cloud_run','aws_apprunner','azure_container_apps',
  'digitalocean_app_platform','cloudflare_pages','railway','render'])
   assert.ok(managedCloudProviders[id]);
});
test('cloud service schema accepts Azure and rejects unsupported hosts',()=>{
 const base={name:'Customer Web',repository:'https://github.com/acme/example',
 branch:'main',cloudRegion:'europe-west1',serviceName:'customer-web',
 monthlyBudgetUsd:25,autoDeploy:true,customerConsent:true};
 assert.equal(serviceSchema.parse({...base,cloudProvider:'azure_container_apps',cloudRegion:'westeurope'}).cloudProvider,
   'azure_container_apps');
 assert.throws(()=>serviceSchema.parse({...base,cloudProvider:'unknown_cloud'}));
});
test('provider success requires exact matching reference, KES amount, receipt and paid date',()=>{
 const order={reference:'TC1234',plan:'starter',priceKes:cloudPlanCatalog.starter.priceKes};
 const provider={reference:'TC1234',status:'success',
  amount:cloudPlanCatalog.starter.priceKes*100,currency:'KES',
  paid_at:'2026-11-06T00:00:00+03:00',id:123456};
 assert.equal(cloudPaymentDecision(order,provider).valid,true);
 assert.equal(cloudPaymentDecision(order,{...provider,amount:1}).valid,false);
 assert.equal(cloudPaymentDecision(order,{...provider,reference:'another'}).valid,false);
 assert.equal(cloudPaymentDecision(order,{...provider,status:'pending'}).valid,false);
 assert.equal(cloudPaymentDecision(order,{...provider,currency:'USD'}).valid,false);
 assert.equal(cloudPaymentDecision(order,{...provider,paid_at:null}).valid,false);
});
test('paid state expires and fail-closes on unverified money',()=>{
 const now=Date.now();
 assert.equal(isCloudServicePaid({status:'paid',receiptVerified:true,paidUntilMs:now+5000},now),true);
 assert.equal(isCloudServicePaid({status:'paid',receiptVerified:false,paidUntilMs:now+5000},now),false);
 assert.equal(isCloudServicePaid({status:'paid',receiptVerified:true,paidUntilMs:now-1},now),false);
 assert.equal(isCloudServicePaid({status:'initiating',receiptVerified:true,paidUntilMs:now+5000},now),false);
});
