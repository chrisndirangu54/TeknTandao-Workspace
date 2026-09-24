import test from 'node:test';
import assert from 'node:assert/strict';
import {validLocation, dayKey, nextPunch, monthBounds} from '../src/attendance_domain.js';

test('attendance punches are one check-in and one check-out per server day', () => {
  assert.equal(dayKey('2026-09-22T21:00:00.000Z'), '2026-09-22');
  const located = validLocation({latitude: 1.23456789, longitude: 36.8});
  assert.equal(located.latitude, 1.234568);
  const open = nextPunch(null, '2026-09-22T08:00:00.000Z', located);
  assert.equal(open.checkIn, '2026-09-22T08:00:00.000Z');
  const closed = nextPunch(open, '2026-09-22T17:00:00.000Z', null);
  assert.equal(closed.checkOut, '2026-09-22T17:00:00.000Z');
  assert.throws(() => nextPunch({...open, ...closed}, '2026-09-22T18:00:00.000Z', null), /checked out/);
  assert.throws(() => validLocation({latitude: 120, longitude: 0}), /Invalid location/);
  assert.deepEqual(monthBounds('2026-12'), {start: '2026-12', end: '2027-01'});
});
