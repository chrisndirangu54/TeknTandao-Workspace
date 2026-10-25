import test from 'node:test';
import assert from 'node:assert/strict';
import {readBoundedJournals} from '../src/ledger_pagination.js';

function fakeCollection(records){
 return {
  orderBy(field){
   assert.equal(field,'__name__');
   return {
    limit(n){
     let after=null;
     return {
      startAfter(doc){after=doc.id;return this;},
      async get(){
       const start=after===null?0:records.findIndex(x=>x.id===after)+1;
       const slice=records.slice(start,start+n);
       return {docs:slice.map(x=>({id:x.id,data:()=>x.data})),size:slice.length,empty:slice.length===0};
      }
     };
    }
   };
  }
 };
}
test('reads every journal across several pages in ID order',async()=>{
 const docs=Array.from({length:523},(_,i)=>({id:'j'+String(i).padStart(4,'0'),data:{amount:i}}));
 const result=await readBoundedJournals(fakeCollection(docs),{pageSize:200,maxJournals:1000});
 assert.equal(result.length,523);
 assert.equal(result[522].amount,522);
});
test('fails safely instead of silently truncating ledgers',async()=>{
 const docs=Array.from({length:12},(_,i)=>({id:'j'+i,data:{amount:i}}));
 await assert.rejects(readBoundedJournals(fakeCollection(docs),{pageSize:5,maxJournals:10}),/exceeds bounded/);
});

test('reports exactly at the configured journal cap without truncation',async()=>{
 const docs=Array.from({length:10},(_,i)=>({id:'j'+String(i).padStart(2,'0'),data:{amount:i}}));
 const rows=await readBoundedJournals(fakeCollection(docs),{pageSize:5,maxJournals:10});
 assert.equal(rows.length,10);
});
test('rejects duplicate or unordered IDs from inconsistent pages',async()=>{
 let call=0;
 const collection={orderBy(){return {limit(){return {startAfter(){return this;},async get(){
   call++;
   const docs=call===1?[{id:'j2',data:()=>({})}]:[{id:'j2',data:()=>({})}];
   return {docs,size:docs.length,empty:false};
 }}};}}};
 await assert.rejects(readBoundedJournals(collection,{pageSize:1,maxJournals:3}),/duplicate or unordered/);
});
