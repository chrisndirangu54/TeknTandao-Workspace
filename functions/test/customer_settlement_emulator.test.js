import test from 'node:test';
import assert from 'node:assert/strict';
import {getFirestore} from 'firebase-admin/firestore';
import {initializeApp,getApps} from 'firebase-admin/app';
import {randomUUID} from 'node:crypto';
const enabled=Boolean(process.env.FIRESTORE_EMULATOR_HOST);
test('Firestore concurrent allocations use one shared settlement balance',{skip:!enabled},async()=>{
 if(!getApps().length)initializeApp({projectId:process.env.GCLOUD_PROJECT||'demo-tandao'});
 const db=getFirestore(),org=db.collection('organizations').doc('crm-concurrency-'+randomUUID());
 const settlement=org.collection('customerSettlements').doc('payment-test');
 const invoices=['invoice-a','invoice-b'].map(id=>org.collection('invoices').doc(id));
 try {
 await Promise.all([settlement.set({amountMinor:1000,allocatedMinor:0}),
  ...invoices.map(ref=>ref.set({total:1000,allocatedMinor:0}))]);
 async function allocate(ref){
  return db.runTransaction(async tx=>{
   const [pay,invoice]=await Promise.all([tx.get(settlement),tx.get(ref)]);
   if(pay.data().allocatedMinor+700>pay.data().amountMinor)throw new Error('Insufficient funds');
   tx.update(settlement,{allocatedMinor:pay.data().allocatedMinor+700});
   tx.update(ref,{allocatedMinor:invoice.data().allocatedMinor+700});
  });
 }
 const results=await Promise.allSettled(invoices.map(allocate));
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
 assert.match(results.find(r=>r.status==='rejected').reason.message,/Insufficient funds/);
 assert.equal((await settlement.get()).data().allocatedMinor,700);
 } finally {
  await db.recursiveDelete(org);
 }
});
