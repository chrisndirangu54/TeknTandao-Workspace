// Provider-neutral ISP integration contracts. These functions never open sockets,
// reveal credentials, collect payments, or issue device commands.
const safeId=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(x);
const integer=(x,min,max)=>Number.isSafeInteger(x)&&x>=min&&x<=max;
const protocols=Object.freeze({routeros_rest:['mikrotik'],unifi_api:['ubiquiti'],
 snmpv3:['mikrotik','ubiquiti','huawei','zte','cisco','other'],
 netconf:['huawei','zte','cisco','other'],tr069:['huawei','zte','other']});
export function validateIspDriver(device){
 if(!device||!safeId(device.siteId)||!safeId(device.managementProfileId))
   throw new Error('Device requires a tenant-local site and management profile');
 if(!protocols[device.driver]?.includes(device.vendor))
   throw new Error('Vendor and driver are incompatible');
 return Object.freeze({vendor:device.vendor,driver:device.driver,
  managementProfileId:device.managementProfileId,siteId:device.siteId,
  connected:false,credentialStatus:'unverified'});
}
export function draftIspProvisioningPlan({request,subscriber,plan,device}){
 if(!request||request.state!=='approved_not_executed'||
   request.executionState!=='not_connected'||!request.approvedBy||
   request.approvedBy===request.requestedBy)
   throw new Error('Independent approval is required before provisioning planning');
 if(!subscriber||subscriber.recordType!=='typed_configuration'||
   !safeId(subscriber.accountCode)||!safeId(subscriber.siteId)||
   !safeId(subscriber.planId)||!safeId(subscriber.deviceId))
   throw new Error('Typed subscriber and linked device required');
 if(!plan||!integer(plan.downloadKbps,64,100000000)||
   !integer(plan.uploadKbps,64,100000000))
   throw new Error('Validated service plan required');
 if(!device||device.siteId!==subscriber.siteId||
   !['mikrotik','ubiquiti','huawei','zte','cisco','other'].includes(device.vendor))
   throw new Error('Device must belong to subscriber site');
 if(!['activate','suspend','resume','deactivate'].includes(request.operation))
   throw new Error('Unsupported provisioning operation');
 return Object.freeze({
   operation:request.operation,
   target:{subscriberId:subscriber.accountCode,siteId:subscriber.siteId,
    planId:subscriber.planId,deviceId:subscriber.deviceId},
   limits:{downloadKbps:plan.downloadKbps,uploadKbps:plan.uploadKbps},
   authorization:{approvedBy:request.approvedBy,requestedBy:request.requestedBy},
   executionState:'dry_run_only',requiresVerifiedAdapter:true,
   executed:false,command:null
 });
}
export function normalizeIspTelemetry(input){
 if(!input||!safeId(input.deviceId)||!safeId(input.siteId)||
   !['snmpv3','syslog','radius','tr069','netconf','unifi_api','routeros_rest'].includes(input.source))
   throw new Error('Invalid telemetry origin');
 if(!integer(input.observedAtMs,0,4102444800000)||
   input.observedAtMs>Date.now()+300000)
   throw new Error('Invalid telemetry timestamp');
 const metrics={};
 for(const field of ['latencyMs','jitterMs','lossPct','utilizationPct','rxBytes','txBytes']){
   if(input[field]===undefined)continue;
   const max=['lossPct','utilizationPct'].includes(field)?100:
     ['rxBytes','txBytes'].includes(field)?Number.MAX_SAFE_INTEGER:60000;
   if(typeof input[field]!=='number'||!Number.isFinite(input[field])||
      input[field]<0||input[field]>max)
     throw new Error('Invalid telemetry metric');
   metrics[field]=input[field];
 }
 if(!Object.keys(metrics).length)throw new Error('At least one telemetry metric is required');
 return {deviceId:input.deviceId,siteId:input.siteId,source:input.source,
   observedAtMs:input.observedAtMs,metrics,
   provenance:'unverified_collector',isLiveVerified:false};
}
