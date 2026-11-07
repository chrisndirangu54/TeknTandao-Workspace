import test from 'node:test';
import assert from 'node:assert/strict';
import {decideManagedCloudDeployment} from '../src/managed_cloud_billing_domain.js';
import {managedCloudProviders} from '../src/managed_cloud_domain.js';

const now=Date.parse('2026-11-07T00:00:00.000Z');
const paid={status:'paid',receiptVerified:true,paymentEnvironment:'live',paidUntilMs:now+86400000};

for(const cloudProvider of Object.keys(managedCloudProviders)){
 test(cloudProvider+' accepts M-Pesa or Paystack verified live billing entitlement',()=>{
   const project={cloudProvider,branch:'main'};
   for(const paymentMethod of ['mpesa','paystack']){
     assert.equal(decideManagedCloudDeployment({
       project,billing:{...paid,paymentMethod},branch:'main',cloudProvider,now
     }).authorized,true);
   }
 });
 test(cloudProvider+' rejects unpaid, test-only, expired and foreign-provider checkout',()=>{
   const project={cloudProvider,branch:'main'};
   for(const billing of [
     undefined,{...paid,status:'pending_verification'},
     {...paid,receiptVerified:false},
     {...paid,paymentEnvironment:'test'},
     {...paid,paidUntilMs:now-1}
   ]){
     assert.equal(decideManagedCloudDeployment({project,billing,branch:'main',cloudProvider,now}).authorized,false);
   }
   assert.equal(decideManagedCloudDeployment({
     project,billing:paid,branch:'unauthorised',cloudProvider,now
   }).authorized,false);
   assert.equal(decideManagedCloudDeployment({
     project,billing:paid,branch:'main',cloudProvider:'fake_cloud',now
   }).authorized,false);
 });
}
