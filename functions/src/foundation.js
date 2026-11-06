// Additive Phase 1 API: Firestore remains authoritative until an explicit migration.
import {onCall, HttpsError} from 'firebase-functions/v2/https';
import {getFirestore, FieldValue} from 'firebase-admin/firestore';
import {createHash, randomUUID} from 'node:crypto';
import {foundationId, foundationPartyInput, foundationIdempotencyKey,
  foundationMembershipAllows, foundationEvent} from './foundation_domain.js';

const db = getFirestore();
const callable = fn => onCall({region:'europe-west1'}, async request => {
  if (!request.auth?.uid) throw new HttpsError('unauthenticated','Sign in first');
  try { return await fn(request); }
  catch (e) {
    if (e instanceof HttpsError) throw e;
    if (e instanceof Error && /^Invalid |^Unexpected /.test(e.message)) {
      throw new HttpsError('invalid-argument',e.message);
    }
    console.error('Foundation operation failed', {name:e?.name});
    throw new HttpsError('internal','Foundation operation failed');
  }
});
function orgRef(orgId) { return db.collection('organizations').doc(foundationId(orgId,'organization')); }
async function authorize(ref, uid, operation) {
  const [org, member] = await Promise.all([ref.get(),ref.collection('members').doc(uid).get()]);
  if (!org.exists || !foundationMembershipAllows(member.data(),operation))
    throw new HttpsError('permission-denied','Workspace access denied');
}

export const foundationCreateParty = callable(async request => {
  const {orgId, party, idempotencyKey} = request.data || {};
  const ref = orgRef(orgId);
  const input = foundationPartyInput(party);
  const key = foundationIdempotencyKey(idempotencyKey);
  const uid = request.auth.uid;
  const receiptId = createHash('sha256').update(uid + ':' + key).digest('hex');
  const receiptRef = ref.collection('foundationIdempotency').doc(receiptId);
  const partyRef = ref.collection('enterpriseParties').doc();
  const eventRef = ref.collection('foundationOutbox').doc();
  const result = await db.runTransaction(async tx => {
    const [organization, membership, existing] = await Promise.all([
      tx.get(ref),tx.get(ref.collection('members').doc(uid)),tx.get(receiptRef)
    ]);
    if (!organization.exists || !foundationMembershipAllows(membership.data(),'write'))
      throw new HttpsError('permission-denied','Workspace access denied');
    const fingerprint = createHash('sha256').update(JSON.stringify(input)).digest('hex');
    if (existing.exists) {
      if (existing.data().fingerprint !== fingerprint) throw new HttpsError('already-exists','Idempotency key reused with different payload');
      return {id:existing.data().partyId, replayed:true};
    }
    const timestamp = new Date().toISOString();
    tx.create(partyRef,{...input,tenantId:orgId,createdBy:uid,version:1,
      createdAt:FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp()});
    tx.create(eventRef,{...foundationEvent({id:eventRef.id,orgId,partyId:partyRef.id,actorUid:uid,occurredAt:timestamp}),
      status:'pending',createdAt:FieldValue.serverTimestamp()});
    tx.create(receiptRef,{partyId:partyRef.id,fingerprint,createdAt:FieldValue.serverTimestamp()});
    tx.create(ref.collection('foundationAudit').doc(),{
      action:'enterprise.party.create',actorUid:uid,resourceId:partyRef.id,tenantId:orgId,
      createdAt:FieldValue.serverTimestamp()});
    return {id:partyRef.id,replayed:false};
  });
  return {...result,tenantId:orgId};
});

export const foundationGetParty = callable(async request => {
  const orgId = foundationId(request.data?.orgId,'organization');
  const partyId = foundationId(request.data?.partyId,'party');
  const ref = orgRef(orgId);
  await authorize(ref,request.auth.uid,'read');
  const party = await ref.collection('enterpriseParties').doc(partyId).get();
  if (!party.exists) throw new HttpsError('not-found','Party not found');
  const data = party.data();
  return {id:party.id,kind:data.kind,displayName:data.displayName,
    externalRef:data.externalRef ?? null,version:data.version,tenantId:orgId};
});

export const foundationListParties = callable(async request => {
  const orgId = foundationId(request.data?.orgId,'organization');
  const ref = orgRef(orgId);
  await authorize(ref,request.auth.uid,'read');
  const requestedLimit = request.data?.limit ?? 25;
  if (!Number.isInteger(requestedLimit) || requestedLimit < 1 || requestedLimit > 100)
    throw new HttpsError('invalid-argument','Limit must be between 1 and 100');
  const items = await ref.collection('enterpriseParties').orderBy('createdAt','desc')
    .limit(requestedLimit).get();
  return {items:items.docs.map(d => ({id:d.id,kind:d.data().kind,
    displayName:d.data().displayName,version:d.data().version})),tenantId:orgId};
});
