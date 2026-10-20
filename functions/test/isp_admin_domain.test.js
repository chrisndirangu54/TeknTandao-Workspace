import test from 'node:test';
import assert from 'node:assert/strict';
import {canAdvanceIncident,canAdvanceWorkOrder} from '../src/isp_admin_domain.js';
test('incident workflow allows acknowledgement/resolution only in forward order',()=>{
  assert.equal(canAdvanceIncident('open','acknowledged'),true);
  assert.equal(canAdvanceIncident('acknowledged','resolved'),true);
  assert.equal(canAdvanceIncident('open','resolved'),true);
  assert.equal(canAdvanceIncident('resolved','open'),false);
  assert.equal(canAdvanceIncident('resolved','acknowledged'),false);
  assert.equal(canAdvanceIncident('open','open'),false);
});
test('work orders do not silently reopen',()=>{
  assert.equal(canAdvanceWorkOrder('open','in_progress'),true);
  assert.equal(canAdvanceWorkOrder('in_progress','closed'),true);
  assert.equal(canAdvanceWorkOrder('open','closed'),true);
  assert.equal(canAdvanceWorkOrder('closed','in_progress'),false);
  assert.equal(canAdvanceWorkOrder('closed','open'),false);
});
