// Pure security invariants for multi-tenant hotspot operations.
export const HOTSPOT_ROLES=Object.freeze({
 owner:Object.freeze(['read','create','revoke']),
 admin:Object.freeze(['read','create','revoke']),
 operator:Object.freeze(['read']),
 member:Object.freeze([])
});
export function canManageHotspot({actorUid,requestedOrgId,membership,action}){
 if(typeof actorUid!=='string'||actorUid.length<1||typeof requestedOrgId!=='string'||!membership||
    membership.workspaceId!==requestedOrgId||membership.uid!==actorUid){
   return {allowed:false,reason:'cross_tenant_or_missing_membership'};
 }
 const role=membership.role;
 if(!Object.hasOwn(HOTSPOT_ROLES,role)||!HOTSPOT_ROLES[role].includes(action))
   return {allowed:false,reason:'insufficient_role'};
 return {allowed:true,reason:'authorized'};
}
export function validateHotspotPlanScope({siteId,planSiteId,voucherSiteId}){
 if(![siteId,planSiteId,voucherSiteId].every(x=>typeof x==='string'&&/^[A-Za-z0-9_-]{5,100}$/.test(x)))
  return {valid:false,reason:'invalid_id'};
 return siteId===planSiteId&&planSiteId===voucherSiteId?
  {valid:true,reason:'same_site'}:{valid:false,reason:'cross_site'};
}
export function publicHotspotProjection(site,plans){
 if(!site||site.status!=='active'||site.portalPublished!==true)return null;
 const safeSite={id:site.id,name:site.name,ssid:site.ssid};
 const safePlans=(plans||[]).filter(p=>p&&p.status==='active'&&p.siteId===site.id)
   .map(p=>({id:p.id,name:p.name,priceKes:p.priceKes,durationMinutes:p.durationMinutes,
   downloadMbps:p.downloadMbps,uploadMbps:p.uploadMbps,maxDevices:p.maxDevices}));
 return {site:safeSite,plans:safePlans,checkoutAvailable:false};
}
