import test from 'node:test';
import assert from 'node:assert/strict';
import {canChangeIncidentStatus, canChangeWorkOrderStatus, canonicalSubscriberCode} from '../src/isp_domain.js';

test('incident transitions are controlled', () => {
  assert.equal(canChangeIncidentStatus('open', 'acknowledged'), true);
  assert.equal(canChangeIncidentStatus('acknowledged', 'resolved'), true);
  assert.equal(canChangeIncidentStatus('resolved', 'open'), false);
  assert.equal(canChangeIncidentStatus('open', 'open'), false);
});
test('technician tasks cannot reopen completed work', () => {
  assert.equal(canChangeWorkOrderStatus('open', 'in_progress'), true);
  assert.equal(canChangeWorkOrderStatus('in_progress', 'completed'), true);
  assert.equal(canChangeWorkOrderStatus('completed', 'open'), false);
});
test('subscriber account codes are canonicalized', () => {
  assert.equal(canonicalSubscriberCode(' k001 '), 'K001');
});
