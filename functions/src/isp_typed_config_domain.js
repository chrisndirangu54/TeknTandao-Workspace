// ISP management domain: typed configuration, no secrets or device commands.
const keys=(o,allowed)=>o&&typeof o==='object'&&!Array.isArray(o)&&
 Object.keys(o).every(k=>allowed.includes(k));
const id=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(value);
const label=value=>typeof value==='string'&&value.trim().length>=2&&value.trim().length<=120;
const uint=(x,min,max)=>Number.isSafeInteger(x)&&x>=min&&x<=max;
const text=(x,max=240)=>typeof x==='string'&&x.trim().length<=max;
export const ispConfigKinds=Object.freeze(['plans','devices','sites','subscribers']);
export function normalizeIspConfig(kind,raw){
 if(!ispConfigKinds.includes(kind))throw new Error('Unsupported ISP configuration kind');
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new Error('Invalid ISP configuration');
 const o={...raw};
 if(!label(o.label))throw new Error('A valid label is required');
 if(kind==='plans'){
  if(!keys(o,['label','downloadKbps','uploadKbps','priceMinorKes','activationMode','vlanId','notes'])||
     !uint(o.downloadKbps,64,100000000)||!uint(o.uploadKbps,64,100000000)||
     !uint(o.priceMinorKes,0,100000000000)||
     !['pppoe','dhcp','hotspot'].includes(o.activationMode)||
     (o.vlanId!==undefined&&!uint(o.vlanId,1,4094))||
     (o.notes!==undefined&&!text(o.notes,1000)))throw new Error('Invalid tariff configuration');
 }
 if(kind==='devices'){
  if(!keys(o,['label','vendor','model','siteId','driver','managementProfileId','notes'])||
     !['mikrotik','ubiquiti','huawei','zte','cisco','other'].includes(o.vendor)||
     !text(o.model,120)||!id(o.siteId)||
     !['routeros_rest','unifi_api','snmpv3','netconf','tr069','other'].includes(o.driver)||
     (o.managementProfileId!==undefined&&!id(o.managementProfileId))||
     (o.notes!==undefined&&!text(o.notes,1000)))throw new Error('Invalid network device configuration');
  // No credentials, passwords, management URLs, or arbitrary router commands.
 }
 if(kind==='sites'){
  if(!keys(o,['label','siteCode','area','notes'])||!id(o.siteCode)||
     !text(o.area,120)||(o.notes!==undefined&&!text(o.notes,1000)))
     throw new Error('Invalid ISP site configuration');
 }
 if(kind==='subscribers'){
  if(!keys(o,['label','accountCode','planId','siteId','deviceId','accessMode','notes'])||
     !id(o.accountCode)||!id(o.planId)||!id(o.siteId)||
     (o.deviceId!==undefined&&!id(o.deviceId))||
     !['fiber','wireless','ethernet'].includes(o.accessMode)||
     (o.notes!==undefined&&!text(o.notes,1000)))throw new Error('Invalid subscriber configuration');
 }
 return {...o,label:o.label.trim(),status:'planned',verifiedProvisioning:false};
}
export function validateIspActivation(input){
 if(!keys(input,['subscriberId','operation','reason','idempotencyKey'])||
    !id(input?.subscriberId)||!id(input?.idempotencyKey)||
    !['activate','suspend','resume','deactivate'].includes(input?.operation)||
    !label(input?.reason))throw new Error('Invalid ISP activation request');
 return {...input,reason:input.reason.trim()};
}
export function approveIspActivation(request,actorUid){
 if(!request||request.state!=='awaiting_approval')throw new Error('Activation request is not awaiting approval');
 if(typeof actorUid!=='string'||request.requestedBy===actorUid)
   throw new Error('An independent approver is required');
 return {state:'approved_not_executed',approvedBy:actorUid};
}
