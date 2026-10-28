import test from 'node:test';
import assert from 'node:assert/strict';
import {ispStoragePath,ispRecordPath} from '../src/isp_product_modes_domain.js';
test('third-party ISP data is isolated to each workspace',()=>{
 const a=ispRecordPath('managed','isp_a','subscribers','customer_1');
 const b=ispRecordPath('managed','isp_b','subscribers','customer_1');
 assert.notEqual(a,b);
 assert.equal(a,'organizations/isp_a/ispManagement/workspace/subscribers/customer_1');
});
test('TeknTandao ISP uses its own platform-only data root',()=>{
 assert.equal(ispStoragePath('operator'),'tekntandaoIsp/operations');
 assert.notEqual(ispStoragePath('operator'),ispStoragePath('managed','isp_a'));
});
test('rejects invalid ISP modes and path traversal',()=>{
 assert.throws(()=>ispStoragePath('all','isp_a'));
 assert.throws(()=>ispStoragePath('managed','../isp_b'));
 assert.throws(()=>ispRecordPath('managed','isp_a','../subscribers','x'));
 assert.throws(()=>ispRecordPath('managed','isp_a','subscribers','../../x'));
});
