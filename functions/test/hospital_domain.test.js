import test from 'node:test';
import assert from 'node:assert/strict';
import {hospitalBooking, patientRecord, assertHospitalPayment} from '../src/hospital_domain.js';

test('hospital charges come from the service catalogue and require future timezone-aware bookings', () => {
  const input = {kind: 'appointment', serviceId: 'consult', scheduledAt: '2030-01-01T10:00:00+03:00', priceMinor: 1};
  const service = {kind: 'appointment', active: true, name: 'Consultation', priceMinor: 250000};
  assert.equal(hospitalBooking(input, service, 0).priceMinor, 250000);
  assert.equal(hospitalBooking(input, service, 0).scheduledAt, '2030-01-01T07:00:00.000Z');
  assert.throws(() => hospitalBooking({...input, scheduledAt: '2030-01-01'}, service, 0));
  assert.throws(() => hospitalBooking(input, {...service, active: false}, 0));
  assert.throws(() => hospitalBooking(input, service, Date.parse('2031-01-01')));
});
test('patient projections omit private notes, storage keys and unfinished lab reports', () => {
  assert.equal(patientRecord('a', {kind: 'clinicalNote', notes: 'Internal'}), null);
  assert.equal(patientRecord('a', {kind: 'labReport', status: 'uploading'}), null);
  const record = patientRecord('a', {kind: 'labReport', status: 'ready', storagePath: 'private', createdBy: 'staff', name: 'Report'});
  assert.deepEqual(record, {id: 'a', kind: 'labReport', name: 'Report', status: 'ready'});
});
test('payment reconciliation rejects incorrect amounts, currency and references', () => {
  const payment = {reference: 'r1', total: 100, currency: 'KES'};
  const verified = {reference: 'r1', amount: 100, currency: 'KES', status: 'success'};
  assertHospitalPayment(payment, verified);
  for (const change of [{reference: 'other'}, {amount: 1}, {currency: 'USD'}, {status: 'pending'}]) {
    assert.throws(() => assertHospitalPayment(payment, {...verified, ...change}), /mismatch/);
  }
});
