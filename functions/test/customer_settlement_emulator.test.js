import test from 'node:test';
import assert from 'node:assert/strict';
import {getFirestore} from 'firebase-admin/firestore';
import {initializeApp,getApps} from 'firebase-admin/app';
const enabled=Boolean(process.env.FIRESTORE_EMULATOR_HOST);
test('Firestore concurrent allocations use one shared settlement balance',{skip:!enabled},async()=>{
 if(!getApps().length)initializeApp({projectId:process.env.GCLOUD_PROJECT||'demo-tandao'});
 const db=getFirestore(),org=db.collection('organizations').doc('crm-concurrency-integration');
 const settlement=org.collection('customerSettlements').doc('payment-test');
 const invoices=['invoice-a','invoice-b'].map(id=>org.collection('invoices').doc(id));
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
 assert.equal((await settlement.get()).data().allocatedMinor,700);
 await db.recursiveDelete(org);
});
