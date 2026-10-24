import test from 'node:test';
import assert from 'node:assert/strict';
import {makeIncidentRunbook} from '../../scripts/cloud-ops/incident-agent.mjs';
test('incident agent suggests steps without executing changes',()=>{
 const r=makeIncidentRunbook({appName:'demo',signals:[{metric:'errorRatePercent',value:15}]});
 assert.equal(r.incidents.length,1);
 assert.equal(r.remoteCommandsExecuted,0);
 assert.equal(r.customerApprovalRequired,true);
});
