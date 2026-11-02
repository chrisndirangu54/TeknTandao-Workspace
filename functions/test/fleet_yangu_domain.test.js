import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {safeId,encryptBridgeToken,decryptBridgeToken,
  fleetVehicleStatus,validateFleetReadiness} from '../src/fleet_yangu_domain.js';

const key=randomBytes(32).toString('base64');
const token='fyw_'+randomBytes(32).toString('base64url');
test('Fleet Yangu token is encrypted at rest and corruption fails closed',()=>{
  const encrypted=encryptBridgeToken(token,key);
  assert.equal(encrypted.version,1);
  assert.ok(!JSON.stringify(encrypted).includes(token));
  assert.equal(decryptBridgeToken(encrypted,key),token);
  assert.throws(()=>decryptBridgeToken({...encrypted,tag:'AAAA'},key));
  assert.throws(()=>encryptBridgeToken('not-a-valid-token',key));
  assert.throws(()=>encryptBridgeToken(token,'not-a-key'));
});
test('Identifiers, vehicle source and risk are validated before dispatch',()=>{
  assert.equal(safeId('vehicle_21'),'vehicle_21');
  assert.throws(()=>safeId('../another-tenant'));
  const rows=fleetVehicleStatus({vehicles:[{id:'v1',registration:'KAB 123',
    healthScore:85,fleetRiskScore:20,telemetry:{fuelPercent:80,speedKph:35}},
    {id:'v2',registration:'bad',healthScore:999,telemetry:{fuelPercent:500}}]},
    [{fleetVehicleId:'v1',workspaceVehicleId:'w1'}]);
  assert.equal(rows[0].workspaceVehicleId,'w1');
  assert.equal(rows[1].healthScore,null);
  assert.equal(rows[1].telemetry.fuelPercent,null);
  assert.deepEqual(validateFleetReadiness(rows[0],[]),
    {readyForReview:true,automaticallyDispatched:false});
  assert.throws(()=>validateFleetReadiness({...rows[0],healthScore:30},[]),/health/);
  assert.throws(()=>validateFleetReadiness({...rows[0],fleetRiskScore:95},[]),/risk/);
  assert.throws(()=>validateFleetReadiness(rows[0],[{vehicleId:'v1',
    severity:'critical',status:'open'}]),/Critical/);
});
