import test from 'node:test';
import assert from 'node:assert/strict';
import {validateCrmPageSize,crmPageResult} from '../src/crm_pagination_domain.js';
test('validates bounded sizes',()=>{
 assert.equal(validateCrmPageSize(50),50);
 for(const x of [0,101,1.5,'50'])assert.throws(()=>validateCrmPageSize(x),/Page size/);
});
test('pagination returns next cursor only when there is more data',()=>{
 const rows=[{id:'a'},{id:'b'},{id:'c'}];
 const first=crmPageResult(rows,2);
 assert.deepEqual(first.records,[rows[0],rows[1]]);
 assert.equal(first.nextCursor,'b');
 assert.equal(first.hasMore,true);
 const final=crmPageResult(rows.slice(2),2);
 assert.equal(final.nextCursor,null);
 assert.equal(final.hasMore,false);
});
