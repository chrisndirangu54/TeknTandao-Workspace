import test from 'node:test';
import assert from 'node:assert/strict';
import {latLon,routePlanningInput,assertRoutePlanResponse,normalizeTraccarPosition}
 from '../src/logistics_intelligence_domain.js';

const shipment=(id,lat,lon,weightKg=50)=>({id,status:'booked',destinationLat:lat,destinationLon:lon,weightKg});
const vehicle=(id,capacityKg=100)=>({id,available:true,capacityKg});
test('rejects missing geocodes rather than estimating a fake route',()=>{
  const input=routePlanningInput([shipment('ok',-1.2,36.8),{id:'bad',status:'draft',weightKg:20}],
    [vehicle('v1')],{lat:-1.3,lon:36.8});
  assert.equal(input.stops.length,1);
  assert.equal(input.excluded[0].reason,'destination_coordinates_required');
  assert.throws(()=>routePlanningInput([shipment('a',-1.2,36.8)],[vehicle('v1')],{lat:91,lon:33}));
});
test('route result must account for every shipment and obey vehicle capacities',()=>{
  const input=routePlanningInput([shipment('a',-1.2,36.8),shipment('b',-1.1,36.9)],[vehicle('v1')],{lat:-1.3,lon:36.8});
  const ok=assertRoutePlanResponse(input,{routes:[{vehicleId:'v1',stops:[{shipmentId:'a',etaMinutes:17},{shipmentId:'b',etaMinutes:42}]}],unassigned:[]});
  assert.equal(ok.routes.length,1);
  assert.throws(()=>assertRoutePlanResponse(input,{routes:[{vehicleId:'v1',stops:[{shipmentId:'a',etaMinutes:17}]}],unassigned:[]}),/omitted/);
  assert.throws(()=>assertRoutePlanResponse(input,{routes:[{vehicleId:'v1',stops:[{shipmentId:'a',etaMinutes:17},{shipmentId:'a',etaMinutes:18}]}],unassigned:[{shipmentId:'b'}]}),/duplicate/);
});
test('Traccar position must belong to approved device and reveal age/staleness',()=>{
  const now=Date.parse('2026-11-02T15:00:00Z');
  const raw={deviceId:44,latitude:-1.29,longitude:36.82,fixTime:'2026-11-02T14:40:00Z',speed:10,valid:true};
  const value=normalizeTraccarPosition(raw,44,now);
  assert.equal(value.stale,true);
  assert.equal(value.speedKmh,18.5);
  assert.throws(()=>normalizeTraccarPosition(raw,55,now),/Wrong GPS/);
  assert.throws(()=>normalizeTraccarPosition({...raw,latitude:100},44,now),/latitude/);
});

test('route validator rejects duplicate vehicle journeys and invalid ETA',()=>{
  const input=routePlanningInput([shipment('a',-1.2,36.8),shipment('b',-1.1,36.9)],
    [vehicle('v1'),vehicle('v2')],{lat:-1.3,lon:36.8});
  const metrics={distanceKm:17,durationMinutes:30};
  assert.throws(()=>assertRoutePlanResponse(input,{routes:[
    {vehicleId:'v1',stops:[{shipmentId:'a',etaMinutes:10}],...metrics},
    {vehicleId:'v1',stops:[{shipmentId:'b',etaMinutes:15}],...metrics},
  ],unassigned:[]}),/Duplicate optimizer vehicle/);
  assert.throws(()=>assertRoutePlanResponse(input,{routes:[
    {vehicleId:'v1',stops:[{shipmentId:'a',etaMinutes:1800}],...metrics},
  ],unassigned:[{shipmentId:'b'}]}),/delivery time window/);
});
