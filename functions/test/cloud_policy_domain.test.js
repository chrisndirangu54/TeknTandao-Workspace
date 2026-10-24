import test from 'node:test';
import assert from 'node:assert/strict';
import {authorizeCloudAction,evaluateCloudOpsRun} from '../src/cloud_policy_domain.js';
const base={actorOrgId:'org-A',resourceOrgId:'org-A',memberActive:true,role:'owner',
 customerApproved:true,operatorApproved:true,nowMs:1000,approvalExpiresAtMs:2000,
 scopedIdentity:true,auditEnabled:true};
test('cross-tenant actions always denied',()=>{
 for(const action of ['read-metrics','apply-deployment','delete-resource'])
 assert.equal(authorizeCloudAction({...base,resourceOrgId:'org-B'},action).allowed,false);
});
test('deployment requires fresh dual approval and no destructive actions',()=>{
 assert.equal(authorizeCloudAction(base,'apply-deployment').allowed,true);
 assert.equal(authorizeCloudAction({...base,operatorApproved:false},'apply-deployment').allowed,false);
 assert.equal(authorizeCloudAction({...base,approvalExpiresAtMs:999},'apply-deployment').allowed,false);
 assert.equal(authorizeCloudAction(base,'delete-resource').allowed,false);
});
test('evaluation measures unsafe grants',()=>{
 const r=evaluateCloudOpsRun({cases:[
  {context:base,action:'apply-deployment',expectAllow:true},
  {context:{...base,resourceOrgId:'other'},action:'apply-deployment',expectAllow:false},
  {context:base,action:'delete-resource',expectAllow:false}]});
 assert.equal(r.unsafeAuthorizationRate,0);assert.equal(r.accuracy,1);
});
