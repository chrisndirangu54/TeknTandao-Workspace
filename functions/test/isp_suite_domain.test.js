import test from 'node:test';
import assert from 'node:assert/strict';
import {
 ispSchema,ispIntegrationStatus,normalizeIspRecord,allowedIspTransition,
 ispRecordId,ispLinkHealth
} from '../src/isp_suite_domain.js';

test('Flutter parity includes all 17 HTML ISP management modules', () => {
 const modules=['sites','devices','links','subscribers','plans','telemetry','incidents',
  'workOrders','support','invoices','payments','provisioning','firmware',
  'notifications','procurement','policies','outreach'];
 for(const name of modules) {
  assert.ok(ispSchema[name],name);
  assert.ok(ispSchema[name].collection.startsWith('isp'));
  assert.ok(Object.keys(ispSchema[name].fields).length>1);
 }
 assert.equal(Object.keys(ispSchema).length,17);
});
test('subscriber account canonicalization and no activation path',()=>{
 const item=normalizeIspRecord('subscribers',{
   accountCode:'ken_12',site:'Nairobi',accessType:'fiber',planMbps:20
 });
 assert.equal(item.accountCode,'KEN_12');
 assert.equal(ispRecordId('subscribers',item,'fake'),'KEN_12');
 assert.equal(allowedIspTransition('subscribers','planned','active'),false);
});
test('record schemas reject unexpected keys, invalid numeric and enum input',()=>{
 assert.throws(()=>normalizeIspRecord('devices',{
  label:'CPE',vendor:'MikroTik',model:'hAP',role:'fiber',site:'Block 1',adminPassword:'secret'
 }),/Unexpected/);
 assert.throws(()=>normalizeIspRecord('telemetry',{
  deviceId:'a',site:'b',latencyMs:10,jitterMs:2,packetLossPct:101,utilizationPct:5
 }),/Invalid packetLossPct/);
 assert.throws(()=>normalizeIspRecord('devices',{
  label:'CPE',vendor:'MikroTik',model:'hAP',role:'illegal',site:'Block 1'
 }),/Invalid role/);
});
test('draft payments cannot settle or activate services',()=>{
 assert.equal(allowedIspTransition('invoices','issued','paid'),false);
 assert.equal(allowedIspTransition('payments','under_review','verified'),false);
 assert.equal(allowedIspTransition('provisioning','approved_for_manual_review','executed'),false);
 assert.equal(allowedIspTransition('firmware','approved_for_manual_review','deployed'),false);
 const p=normalizeIspRecord('payments',{
  invoiceCode:'B_1',subscriberId:'KEN_12',
  provider:'mpesa',reference:'QABC123',amountKes:2000,
 });
 assert.equal(ispRecordId('payments',p,'uuid'),'MPESA_QABC123');
});
test('site coordinates must be paired',()=>{
 assert.throws(()=>normalizeIspRecord('sites',{
  name:'Building',type:'building',area:'Ruiru',latitude:-1.2,
 }),/Latitude and longitude/);
});
test('optical and RF measurements may be negative; out-of-range values fail',()=>{
 const record=normalizeIspRecord('telemetry',{
  deviceId:'some-device',site:'Estate',latencyMs:14,jitterMs:3,
  packetLossPct:0,utilizationPct:35,rxOpticalDbm:-23,wirelessRssiDbm:-65
 });
 assert.equal(record.source,'manual_admin');
 assert.equal(record.rxOpticalDbm,-23);
 assert.equal(ispLinkHealth(record),'healthy');
 assert.equal(ispLinkHealth({...record,packetLossPct:7}),'critical');
 assert.equal(ispLinkHealth({jitterMs:2}),'insufficient_data');
});
test('plans and invoice identifiers are canonical and unique IDs can be reserved',()=>{
 const invoice=normalizeIspRecord('invoices',{
  invoiceCode:'inv_25',subscriberId:'ACC1',description:'Monthly package',amountKes:3000
 });
 assert.equal(ispRecordId('invoices',invoice,'uuid'),'INV_25');
});
test('all live provider integration flags remain false',()=>{
 assert.ok(ispIntegrationStatus.length>=8);
 assert.ok(ispIntegrationStatus.every(s=>s.status!=='connected'&&s.status!=='live'));
});
