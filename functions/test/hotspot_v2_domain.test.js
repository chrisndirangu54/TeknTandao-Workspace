import test from 'node:test';
import assert from 'node:assert/strict';
import {canManageHotspot,validateHotspotPlanScope,publicHotspotProjection} from '../src/hotspot_v2_domain.js';
const actor={actorUid:'user_10001',requestedOrgId:'tenant_10001'};
const membership={workspaceId:'tenant_10001',uid:'user_10001',role:'owner'};
test('deny cross-tenant membership, including correct role with wrong tenant',()=>{
 assert.equal(canManageHotspot({...actor,membership:{...membership,workspaceId:'tenant_20002'},action:'create'}).allowed,false);
 assert.equal(canManageHotspot({...actor,membership:{...membership,uid:'user_20002'},action:'create'}).allowed,false);
 assert.equal(canManageHotspot({...actor,membership,action:'create'}).allowed,true);
});
test('operator is read-only and ordinary members cannot inspect hotspot records',()=>{
 assert.equal(canManageHotspot({...actor,membership:{...membership,role:'operator'},action:'create'}).allowed,false);
 assert.equal(canManageHotspot({...actor,membership:{...membership,role:'operator'},action:'read'}).allowed,true);
 assert.equal(canManageHotspot({...actor,membership:{...membership,role:'member'},action:'read'}).allowed,false);
});
test('foreign plan and voucher sites never share an authorization scope',()=>{
 assert.equal(validateHotspotPlanScope({siteId:'site_10001',planSiteId:'site_10001',voucherSiteId:'site_20002'}).valid,false);
});
test('public catalog projection omits internal identifiers and draft tariffs',()=>{
 const data=publicHotspotProjection(
 {id:'site_10001',name:'Pilot',ssid:'Guest',status:'active',portalPublished:true,collectorNasId:'PRIVATE'},
 [{id:'plan_10001',siteId:'site_10001',name:'Basic',status:'active',priceKes:10,durationMinutes:30,downloadMbps:3,uploadMbps:1,maxDevices:1,secret:'DO_NOT_LEAK'},
 {id:'plan_10002',siteId:'site_10001',name:'Draft',status:'draft'}]);
 assert.equal(data.plans.length,1);
 assert.equal(JSON.stringify(data).includes('PRIVATE'),false);
 assert.equal(JSON.stringify(data).includes('DO_NOT_LEAK'),false);
 assert.equal(data.checkoutAvailable,false);
});
