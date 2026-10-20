import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluateLink,summarizeTelemetry,possibleSharedFault,customerExperienceRisk} from '../src/isp_analytics_domain.js';
const normal={latencyMs:12,jitterMs:2,packetLossPct:0,utilizationPct:35};
test('normal metrics remain healthy',()=>assert.equal(evaluateLink(normal).status,'healthy'));
test('packet loss leads to warning and critical levels',()=>{
 assert.equal(evaluateLink({...normal,packetLossPct:1.5}).status,'warning');
 assert.equal(evaluateLink({...normal,packetLossPct:6}).status,'critical');
});
test('missing telemetry is never reported as healthy',()=>{
 assert.equal(evaluateLink({latencyMs:10}).status,'insufficient_data');
});
test('aggregate reports counts and averages only for complete readings',()=>{
 const result=summarizeTelemetry([normal,{...normal,latencyMs:40,utilizationPct:95},{}]);
 assert.equal(result.sampleCount,3);
 assert.equal(result.validSamples,2);
 assert.equal(result.statusCount.warning,1);
 assert.equal(result.statusCount.insufficient_data,1);
 assert.equal(result.means.latencyMs,26);
});
test('shared segment fault requires multiple distinct affected devices',()=>{
 const readings=[1,2,3].map(i=>({...normal,deviceId:'d'+i,segmentId:'pon-1',packetLossPct:6}));
 assert.equal(possibleSharedFault(readings).length,1);
 assert.equal(possibleSharedFault([...readings.slice(0,2),readings[0]]).length,0);
});
test('churn heuristic is bounded and never claims predictive status',()=>{
 assert.equal(customerExperienceRisk({outages30d:100,openTickets:100}).score,100);
 assert.match(customerExperienceRisk({openTickets:2}).caveat,/not trained/);
});
