import test from 'node:test';
import assert from 'node:assert/strict';
import {getFirestore} from 'firebase-admin/firestore';
import {initializeApp,getApps} from 'firebase-admin/app';
import {randomUUID} from 'node:crypto';

const enabled=Boolean(process.env.FIRESTORE_EMULATOR_HOST);
test('foundation outbox delivery is transactional, retry-safe and tenant-scoped',
  {skip:!enabled},async()=>{
    if(!getApps().length) initializeApp({projectId:process.env.GCLOUD_PROJECT||'demo-tandao'});
    const {deliverFoundationOutbox}=await import('../src/foundation_outbox.js');
    const db=getFirestore();
    const id=randomUUID();
    const orgA=db.collection('organizations').doc('foundation-a-'+id);
    const orgB=db.collection('organizations').doc('foundation-b-'+id);
    const eventId='foundationEvent1';
    const eventA=orgA.collection('foundationOutbox').doc(eventId);
    const eventB=orgB.collection('foundationOutbox').doc(eventId);
    const payload=(tenantId)=>({
      eventId,tenantId,eventType:'enterprise.party.created',eventVersion:1,
      aggregateType:'party',aggregateId:'party1',actorUid:'actor1',
      data:{partyId:'party1'},status:'pending',occurredAt:'2026-11-03T07:00:00Z'
    });
    try{
      await Promise.all([orgA.set({name:'A'}),orgB.set({name:'B'})]);
      await Promise.all([eventA.create(payload(orgA.id)),eventB.create(payload(orgB.id))]);
      const concurrent=await Promise.all([
        deliverFoundationOutbox(eventA,db),
        deliverFoundationOutbox(eventA,db)
      ]);
      assert.equal(concurrent.every(x=>x.delivered),true);
      const eventBusA=orgA.collection('eventBus').doc('foundation_'+eventId);
      assert.equal((await eventBusA.get()).data().payload.partyId,'party1');
      assert.equal((await orgA.collection('foundationInbox').doc(eventId).get()).exists,true);
      assert.equal((await eventA.get()).data().status,'delivered');
      assert.equal((await orgB.collection('eventBus').doc('foundation_'+eventId).get()).exists,false);
      assert.equal((await eventB.get()).data().status,'pending');
      const replay=await deliverFoundationOutbox(eventA,db);
      assert.equal(replay.replayed,true);
      assert.equal((await eventBusA.get()).data().foundationEventId,eventId);
      await deliverFoundationOutbox(eventB,db);
      assert.equal((await orgB.collection('eventBus').doc('foundation_'+eventId).get()).exists,true);
    }finally{
      await Promise.all([db.recursiveDelete(orgA),db.recursiveDelete(orgB)]);
    }
  }
);

test('mismatched outbox tenant is rejected without publishing',
  {skip:!enabled},async()=>{
    if(!getApps().length) initializeApp({projectId:process.env.GCLOUD_PROJECT||'demo-tandao'});
    const {deliverFoundationOutbox}=await import('../src/foundation_outbox.js');
    const db=getFirestore();
    const org=db.collection('organizations').doc('foundation-reject-'+randomUUID());
    const event=org.collection('foundationOutbox').doc('badEvent');
    try{
      await event.create({eventId:'badEvent',tenantId:'anotherTenant',
        eventType:'enterprise.party.created',eventVersion:1,aggregateId:'party1',
        data:{partyId:'party1'},status:'pending'});
      await assert.rejects(()=>deliverFoundationOutbox(event,db),/mismatch/);
      assert.equal((await org.collection('eventBus').doc('foundation_badEvent').get()).exists,false);
    }finally{
      await db.recursiveDelete(org);
    }
  }
);
