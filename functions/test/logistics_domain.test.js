import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeShipment,normalizeCarrier,transitionShipment,tariffComparison,
  dispatchProposal,trackingFromDhl,carrierDirectory} from '../src/logistics_domain.js';

const shipment={reference:'TF-010',customer:'Acme Kenya',origin:'Nairobi',
  destination:'Kisumu',mode:'road',weightKg:100};
test('normalize shipment and fail closed on invalid cargo',()=>{
  const data=normalizeShipment(shipment);
  assert.equal(data.status,'draft');
  assert.equal(data.currency,'KES');
  assert.throws(()=>normalizeShipment({...shipment,weightKg:-5}),/weight/);
  assert.throws(()=>normalizeShipment({...shipment,mode:'space'}),/mode/);
  assert.throws(()=>normalizeShipment({...shipment,reference:''}),/reference/);
});
test('carrier directory declares non-connected providers',()=>{
  assert.ok(carrierDirectory.some(x=>x.id==='dhl'));
  assert.equal(normalizeCarrier({providerId:'other',company:'Road Freight'}).connectionStatus,'manual');
  assert.throws(()=>normalizeCarrier({providerId:'unknown',company:'Other'}));
});
test('shipments cannot skip required states or revive delivery',()=>{
  assert.equal(transitionShipment('draft','booked'),'booked');
  assert.equal(transitionShipment('booked','in_transit'),'in_transit');
  assert.throws(()=>transitionShipment('draft','delivered'));
  assert.throws(()=>transitionShipment('delivered','in_transit'));
});
test('tariff comparator is explicitly not a live quote',()=>{
  const offers=tariffComparison(normalizeShipment(shipment),[
    {id:'a',company:'A',tariffMinor:10000,tariffPerKgMinor:10,currency:'KES'},
    {id:'b',company:'B',tariffMinor:5000,tariffPerKgMinor:4,currency:'KES'}
  ]);
  assert.equal(offers[0].estimatedCostMinor,5400);
  assert.equal(offers[0].isLiveQuote,false);
});
test('dispatch does not overallocate capacity',()=>{
  const result=dispatchProposal([
    {id:'s1',weightKg:500,status:'booked'},
    {id:'s2',weightKg:700,status:'draft'},
    {id:'s3',weightKg:400,status:'draft'}
  ],[{id:'v1',capacityKg:1000,available:true},{id:'v2',capacityKg:700,available:true}]);
  assert.equal(result.assignments.reduce((n,v)=>n+v.shipmentIds.length,0),3);
  assert.ok(result.assignments.every(v=>v.loadKg<=1000));
  assert.equal(result.optimal,false);
});
test('DHL response normalizes only safe tracking fields',()=>{
  const r=trackingFromDhl({shipments:[{id:'12345',status:{statusCode:'transit'},
    events:[{timestamp:'2026-10-20T10:00:00Z',description:'Processed'}]}]});
  assert.equal(r.found,true);
  assert.equal(r.events.length,1);
  assert.equal(trackingFromDhl({shipments:[]}).found,false);
});
