import test from 'node:test';import assert from 'node:assert/strict';
import {analyzeHotspotTelemetry,forecastNextHourClients} from '../src/hotspot_statistics_domain.js';
const samples=Array.from({length:12},(_,i)=>({observedAtMs:1000+i*60000,
 metrics:{clientCount:10+i,latencyMs:i+5,wanUp:i!==5}}));
test('statistics require a minimum number of observed signed telemetry records',()=>{
 assert.equal(analyzeHotspotTelemetry(samples.slice(0,4)).available,false);
 assert.equal(analyzeHotspotTelemetry(samples).available,true);
 assert.equal(analyzeHotspotTelemetry(samples).wanOutageSamples,1);
});
test('forecast is bounded and labelled as an uncalibrated estimate',()=>{
 const r=forecastNextHourClients(samples);
 assert.equal(r.available,true);assert.ok(r.forecastClients>=0);
 assert.equal(r.confidence,'unquantified');
});
