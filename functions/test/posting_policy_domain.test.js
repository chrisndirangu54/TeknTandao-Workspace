import test from 'node:test';
import assert from 'node:assert/strict';
import {preparePosting} from '../src/posting_policy_domain.js';
import {invoiceJournal} from '../src/ledger_domain.js';
const input={postingDate:'2026-10-25',sourceType:'sale',sourceId:'s1',journal:invoiceJournal(500)};
test('prepares balanced entries for an open accounting period',()=>{
 const p=preparePosting(input);
 assert.equal(p.journal.period,'2026-10');
 assert.equal(p.journal.sourceId,'s1');
});
test('rejects closed periods and tampered unbalanced entries',()=>{
 assert.throws(()=>preparePosting({...input,periodState:{status:'closed'}}),/closed/);
 assert.throws(()=>preparePosting({...input,journal:{...input.journal,lines:[{...input.journal.lines[0],debit:400},input.journal.lines[1]]}}),/balance/);
});
test('only exactly matching journal requests may replay',()=>{
 assert.equal(preparePosting({...input,existing:{...input.journal,sourceType:'sale',sourceId:'s1',period:'2026-10',postingDate:'2026-10-25'}}).replayed,true);
 assert.throws(()=>preparePosting({...input,existing:{sourceType:'sale',sourceId:'s2',period:'2026-10',postingDate:'2026-10-25'}}),/conflicting/);
});

test('replay rejects same source with modified financial amount',()=>{
 assert.throws(()=>preparePosting({...input,existing:{...invoiceJournal(999),sourceType:'sale',sourceId:'s1',period:'2026-10',postingDate:'2026-10-25'}}),/conflicting financial content/);
});
