import test from 'node:test';
import assert from 'node:assert/strict';
import {crmActivity,crmActivityTimeline} from '../src/crm_activity_domain.js';
test('manual interaction requires type, summary and UTC timestamp',()=>{
 const activity=crmActivity({type:'call',summary:'Discussed renewal',occurredAt:'2026-10-26T09:00:00Z'});
 assert.equal(activity.source,'manual');
 assert.equal(activity.status,'logged');
 assert.throws(()=>crmActivity({type:'sms',summary:'Text',occurredAt:'2026-10-26T09:00:00Z'}),/Unsupported/);
 assert.throws(()=>crmActivity({type:'call',summary:'',occurredAt:'2026-10-26T09:00:00Z'}),/summary/);
});
test('timeline sorts newest first without mutating source',()=>{
 const rows=[{id:'a',occurredAt:'2026-10-25T09:00:00Z'},{id:'b',occurredAt:'2026-10-26T09:00:00Z'}];
 assert.equal(crmActivityTimeline(rows)[0].id,'b');
 assert.equal(rows[0].id,'a');
});
