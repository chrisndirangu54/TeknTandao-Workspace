import test from 'node:test';
import assert from 'node:assert/strict';
import {bimaFleetQuoteInput,bimaNormalizeQuote,bimaManualPolicy,bimaRenewal}
  from '../src/bima_guardian_fleet_domain.js';
test('quote data cannot contain raw fleet telemetry or personal driver details',()=>{
  const actual=bimaFleetQuoteInput({vehicleId:'fleet_1',subtype:'fleet',
    sumInsured:2000000,driverHealth:'private',gpsTrail:[1,2],canFrames:[3]});
  assert.deepEqual(actual,{vehicleId:'fleet_1',product:'motor',
    subtype:'fleet',sumInsured:2000000,audience:'fleet_logistics'});
  assert.throws(()=>bimaFleetQuoteInput({vehicleId:'v1',subtype:'travel',sumInsured:100000}));
  assert.throws(()=>bimaFleetQuoteInput({vehicleId:'v1',subtype:'fleet',sumInsured:NaN}));
});
test('Bima Guardian demo rates never become verified cover',()=>{
  const q=bimaNormalizeQuote({source:'demo',id:'quo_1',currency:'KES',options:[
    {insurerId:'test',insurerName:'Demo',premium:2000,privateFlag:'hidden'}
  ]});
  assert.equal(q.source,'demo');
  assert.equal(q.insurerConfirmed,false);
  assert.equal(q.status,'indicative_not_bound');
  assert.ok(!JSON.stringify(q).includes('privateFlag'));
  assert.throws(()=>bimaNormalizeQuote({options:'invalid'}));
});
test('operator-recorded policies are unverified and renewal dates are derived',()=>{
  const p=bimaManualPolicy({vehicleId:'v1',insurer:'Example',policyNumber:'P-001',
    subtype:'commercial',effectiveFrom:'2026-01-01',expiresOn:'2026-11-25'});
  assert.equal(p.coverageConfirmed,false);
  const renewal=bimaRenewal(p,new Date('2026-11-02T05:00:00Z'));
  assert.equal(renewal.daysToExpiry,23);
  assert.equal(renewal.coverageConfirmed,false);
  assert.throws(()=>bimaManualPolicy({...p,expiresOn:'2025-01-01'}));
});
