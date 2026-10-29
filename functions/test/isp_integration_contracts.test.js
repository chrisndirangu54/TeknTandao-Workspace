import test from 'node:test';
import assert from 'node:assert/strict';
import {validateIspDriver,draftIspProvisioningPlan,normalizeIspTelemetry} from '../src/isp_integration_contracts.js';
const device={vendor:'mikrotik',driver:'routeros_rest',siteId:'main',managementProfileId:'vault_profile_1'};
const subscriber={recordType:'typed_configuration',accountCode:'cust1',siteId:'main',planId:'fiber20',deviceId:'edge1'};
const request={state:'approved_not_executed',executionState:'not_connected',requestedBy:'alice',
 approvedBy:'bob',operation:'activate'};
const plan={downloadKbps:20000,uploadKbps:10000};
test('driver compatibility fails closed for unknown protocols and missing profiles',()=>{
 assert.equal(validateIspDriver(device).connected,false);
 assert.throws(()=>validateIspDriver({...device,vendor:'huawei'}),/incompatible/);
 assert.throws(()=>validateIspDriver({...device,managementProfileId:undefined}),/management profile/);
});
test('independently approved provisioning yields no executable commands',()=>{
 const result=draftIspProvisioningPlan({request,subscriber,plan,device});
 assert.equal(result.executed,false);
 assert.equal(result.command,null);
 assert.equal(result.executionState,'dry_run_only');
 assert.throws(()=>draftIspProvisioningPlan({request:{...request,approvedBy:'alice'},subscriber,plan,device}),/Independent approval/);
 assert.throws(()=>draftIspProvisioningPlan({request,subscriber,plan,device:{...device,siteId:'another'}}),/site/);
 assert.throws(()=>draftIspProvisioningPlan({request:{...request,state:'awaiting_approval'},subscriber,plan,device}),/Independent approval/);
});
test('telemetry rejects forged types, nonfinite metrics and future timestamps',()=>{
 const base={deviceId:'router1',siteId:'main',source:'snmpv3',observedAtMs:Date.now(),latencyMs:10,lossPct:0};
 assert.equal(normalizeIspTelemetry(base).isLiveVerified,false);
 assert.throws(()=>normalizeIspTelemetry({...base,latencyMs:Infinity}));
 assert.throws(()=>normalizeIspTelemetry({...base,lossPct:120}));
 assert.throws(()=>normalizeIspTelemetry({...base,source:'admin_manual'}));
 assert.throws(()=>normalizeIspTelemetry({...base,observedAtMs:Date.now()+3600000}));
});
