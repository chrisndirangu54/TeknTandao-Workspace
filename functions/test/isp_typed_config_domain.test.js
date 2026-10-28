import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeIspConfig,validateIspActivation,approveIspActivation} from '../src/isp_typed_config_domain.js';
test('typed ISP plans accept bandwidth and VLANs, reject non-numeric and invalid tariffs',()=>{
 const valid={label:'Home Fiber 20M',downloadKbps:20000,uploadKbps:10000,priceMinorKes:250000,activationMode:'pppoe',vlanId:100};
 assert.equal(normalizeIspConfig('plans',valid).verifiedProvisioning,false);
 assert.throws(()=>normalizeIspConfig('plans',{...valid,downloadKbps:'20000'}));
 assert.throws(()=>normalizeIspConfig('plans',{...valid,vlanId:4095}));
 assert.throws(()=>normalizeIspConfig('plans',{...valid,password:'should-not-store'}));
});
test('devices never accept passwords, arbitrary URLs or router commands',()=>{
 const dev={label:'Edge Router',vendor:'mikrotik',model:'CCR',siteId:'central',driver:'routeros_rest'};
 assert.equal(normalizeIspConfig('devices',dev).status,'planned');
 for(const injected of [{password:'admin'},{routerUrl:'https://127.0.0.1'},{command:'/system reboot'}])
  assert.throws(()=>normalizeIspConfig('devices',{...dev,...injected}));
});
test('subscriber has typed tenant-local resource references',()=>{
 const s={label:'Customer One',accountCode:'SUB001',planId:'plan1',siteId:'central',accessMode:'fiber'};
 assert.equal(normalizeIspConfig('subscribers',s).planId,'plan1');
 assert.throws(()=>normalizeIspConfig('subscribers',{...s,planId:'../../operator'}));
});
test('activation requires independent approval and is never reported executed',()=>{
 const req=validateIspActivation({subscriberId:'sub_1',operation:'activate',reason:'New customer order',idempotencyKey:'request_1'});
 assert.equal(req.operation,'activate');
 assert.deepEqual(approveIspActivation({state:'awaiting_approval',requestedBy:'adminA'},'adminB'),
  {state:'approved_not_executed',approvedBy:'adminB'});
 assert.throws(()=>approveIspActivation({state:'awaiting_approval',requestedBy:'adminA'},'adminA'));
 assert.throws(()=>approveIspActivation({state:'approved_not_executed',requestedBy:'adminA'},'adminB'));
 assert.throws(()=>validateIspActivation({...req,operation:'execute_router_command'}));
});
