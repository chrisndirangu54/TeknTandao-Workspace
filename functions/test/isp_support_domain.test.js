import test from 'node:test';
import assert from 'node:assert/strict';
import {capacityForecast, explainSupportMessage, minimumCpeCriteria} from '../src/isp_support_domain.js';
test('capacity heuristic requires sufficient samples',()=>{
 assert.equal(capacityForecast([{utilizationPct:40}]).state,'insufficient_data');
 assert.equal(capacityForecast(Array.from({length:7},()=>({utilizationPct:96}))).state,'capacity_review');
});
test('support triage recommends human review and verified payment check',()=>{
 const result=explainSupportMessage('My M-Pesa has not renewed');
 assert.equal(result.category,'payment');
 assert.match(result.nextStep,/verified payment reference/);
 assert.equal(result.needsAgentReview,true);
});
test('equipment policy includes management and interoperability',()=>{
 assert.ok(minimumCpeCriteria.telemetry.length);
 assert.ok(minimumCpeCriteria.validation.some(x=>x.includes('OLT/ONT')));
});
