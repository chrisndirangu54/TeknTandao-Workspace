// Deliver foundation events atomically to the existing Firestore business event bus.
// The existing processBusinessEvent trigger consumes the bus asynchronously.
import {getFirestore,FieldValue} from 'firebase-admin/firestore';
import {onDocumentCreated} from 'firebase-functions/v2/firestore';
import {onSchedule} from 'firebase-functions/v2/scheduler';
import {outboxBusinessEvent} from './foundation_event_domain.js';

const db=getFirestore();
const region='europe-west1';

/**
 * Atomic same-database delivery. Writes exactly one eventBus document per outbox ID;
 * a receipt and status change commit in the same transaction. Trigger replays are safe.
 * The downstream business automation remains at-least-once and separately governed.
 */
export async function deliverFoundationOutbox(ref, database=db) {
  const org=ref.parent.parent;
  if (!org || org.parent.id !== 'organizations' || ref.parent.id !== 'foundationOutbox')
    throw new Error('Unexpected foundation outbox path');
  const eventBus=org.collection('eventBus').doc('foundation_'+ref.id);
  const receipt=org.collection('foundationInbox').doc(ref.id);
  return database.runTransaction(async tx=>{
    const [eventSnapshot,busSnapshot,receiptSnapshot]=await Promise.all([
      tx.get(ref),tx.get(eventBus),tx.get(receipt)
    ]);
    if (!eventSnapshot.exists) return {delivered:false,reason:'missing'};
    const event=eventSnapshot.data();
    if (event.tenantId!==org.id || event.eventId!==ref.id)
      throw new Error('Outbox tenant or identifier mismatch');
    const body=outboxBusinessEvent(event);
    if (!busSnapshot.exists) tx.create(eventBus,{...body,createdAt:FieldValue.serverTimestamp()});
    if (!receiptSnapshot.exists) tx.create(receipt,{
      eventId:ref.id,deliveredAt:FieldValue.serverTimestamp(),busId:eventBus.id
    });
    if (event.status!=='delivered') tx.update(ref,{
      status:'delivered',deliveredAt:FieldValue.serverTimestamp(),
      deliveryAttempts:FieldValue.increment(1)
    });
    return {delivered:true,replayed:busSnapshot.exists};
  });
}

export const foundationOutboxCreated=onDocumentCreated({
  document:'organizations/{orgId}/foundationOutbox/{eventId}',
  region,retry:true
},async event=>{
  if (!event.data) return;
  await deliverFoundationOutbox(event.data.ref);
});

// Crash/restart recovery: query pending deliveries, including events whose
// create trigger did not complete. Backlog is bounded per run and observable.
export const foundationOutboxRecovery=onSchedule({
  schedule:'every 5 minutes',region,timeoutSeconds:180,
  memory:'512MiB',maxInstances:1
},async()=>{
  const pending=await db.collectionGroup('foundationOutbox')
    .where('status','==','pending').limit(100).get();
  let delivered=0,failed=0;
  for(const doc of pending.docs){
    try{
      await deliverFoundationOutbox(doc.ref);
      delivered++;
    }catch(error){
      failed++;
      console.error('foundation.outbox.delivery_failed',{
        outboxPath:doc.ref.path,errorName:error?.name||'Error'
      });
    }
  }
  console.info('foundation.outbox.recovery',{
    selected:pending.size,delivered,failed,moreMayRemain:pending.size===100
  });
  if(failed) throw new Error(`Foundation outbox delivery failures: ${failed}`);
});
