import test from 'node:test';
import assert from 'node:assert/strict';
import {reconcileShiftPunches} from '../src/hr_shift_reconciliation_domain.js';
const shift={startAt:'2026-11-02T08:00:00Z',endAt:'2026-11-02T17:00:00Z'};
test('missing punches cannot be treated as worked time',()=>{
 const result=reconcileShiftPunches(shift,[]);
 assert.equal(result.status,'missing_or_incomplete');
 assert.equal(result.verified,false);
 assert.equal(result.workedMinutes,null);
});
test('complete punches produce raw matching or exception evidence',()=>{
 const ok=reconcileShiftPunches(shift,[{id:'p1',checkIn:'2026-11-02T08:03:00Z',checkOut:'2026-11-02T17:00:00Z'}]);
 assert.equal(ok.status,'matched');
 assert.equal(ok.workedMinutes,537);
 assert.equal(ok.verified,false);
 const late=reconcileShiftPunches(shift,[{id:'p2',checkIn:'2026-11-02T08:20:00Z',checkOut:'2026-11-02T16:40:00Z'}]);
 assert.equal(late.status,'exception');
 assert.equal(late.lateMinutes,15);
 assert.equal(late.earlyDepartureMinutes,15);
});
