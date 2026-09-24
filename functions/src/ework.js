import {getFirestore, FieldValue} from 'firebase-admin/firestore';
import {onCall, HttpsError} from 'firebase-functions/v2/https';
import {createHash, randomUUID} from 'node:crypto';
import {identifier, textValue, optionalText, canAccess} from './domain.js';
import {overdueTaskGap, reviewGap, buildBrief, approveBrief, proposeMatches, approveMatch, buildMilestone, submitMilestone, acceptMilestone, acceptanceProgress} from './ework_domain.js';

const region = 'europe-west1';
const stamp = () => FieldValue.serverTimestamp();
function api(handler) {
  return onCall({region}, async request => {
    try { return await handler(request); }
    catch (error) {
      if (error instanceof HttpsError) throw error;
      throw new HttpsError('failed-precondition', error.message || 'Request failed');
    }
  });
}
async function desk(request) {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in first');
  const db = getFirestore();
  const org = db.doc(`organizations/${identifier(request.data.orgId)}`);
  const [installation, member] = await Promise.all([
    org.collection('apps').doc('ework').get(), org.collection('members').doc(request.auth.uid).get(),
  ]);
  if (!canAccess(member.data(), 'ework', installation.data())) throw new HttpsError('permission-denied', 'EWork access required');
  return {db, org, user: request.auth.uid, records: org.collection('modules').doc('ework').collection('records')};
}
export const eworkList = api(async request => {
  const {records} = await desk(request);
  const page = await records.orderBy('updatedAt', 'desc').limit(100).get();
  return {records: page.docs.map(doc => ({id: doc.id, kind: doc.data().kind, name: doc.data().name, status: doc.data().status || null,
    gapId: doc.data().gapId || null, briefId: doc.data().briefId || null, freelancerId: doc.data().freelancerId || null,
    engagementId: doc.data().engagementId || null, skills: doc.data().skills || '', summary: doc.data().summary || '',
    reason: doc.data().reason || '', availability: doc.data().availability || '', optedIn: doc.data().optedIn === true, dueAt: doc.data().dueAt || null}))};
});

export const eworkAddGap = api(async request => {
  const {records, user} = await desk(request);
  const id = identifier(request.data.id || randomUUID());
  await records.doc(id).create({kind: 'gap', name: textValue(request.data.name), sourceApp: 'manual', sourceId: id, status: 'detected',
    notes: optionalText(request.data.notes ?? '', 4000), createdBy: user, createdAt: stamp(), updatedAt: stamp()});
  return {id};
});

export const eworkScanGaps = api(async request => {
  const {db, org, records, user} = await desk(request);
  const tasks = await org.collection('modules').doc('crm').collection('records').where('kind', '==', 'task').limit(100).get();
  const created = [];
  await db.runTransaction(async tx => {
    for (const doc of tasks.docs) {
      const gap = overdueTaskGap({...doc.data(), id: doc.id}, Date.now());
      if (!gap) continue;
      const ref = records.doc(`gap_crm_${doc.id}`);
      if ((await tx.get(ref)).exists) continue;
      tx.create(ref, {...gap, createdBy: user, createdAt: stamp(), updatedAt: stamp()});
      created.push(ref.id);
    }
  });
  return {created};
});

export const eworkReviewGap = api(async request => {
  const {records} = await desk(request);
  const ref = records.doc(identifier(request.data.id));
  const data = (await ref.get()).data();
  await ref.update({...reviewGap(data, request.data.decision), updatedAt: stamp()});
  return {ok: true};
});

export const eworkSaveBrief = api(async request => {
  const {db, records, user} = await desk(request);
  const brief = buildBrief(request.data);
  const id = identifier(request.data.id || randomUUID());
  await db.runTransaction(async tx => {
    const gap = await tx.get(records.doc(brief.gapId));
    if (!gap.exists || gap.data().kind !== 'gap' || gap.data().status === 'dismissed') throw new Error('Select an open gap');
    tx.create(records.doc(id), {...brief, createdBy: user, createdAt: stamp(), updatedAt: stamp()});
  });
  return {id};
});

export const eworkApproveBrief = api(async request => {
  const {db, records} = await desk(request);
  const briefRef = records.doc(identifier(request.data.id));
  await db.runTransaction(async tx => {
    const briefSnap = await tx.get(briefRef);
    const brief = briefSnap.data();
    const gapSnap = await tx.get(records.doc(brief?.gapId || 'missing'));
    const gap = gapSnap.data();
    tx.update(briefRef, {...approveBrief(gap && {...gap, id: gapSnap.id}, brief), updatedAt: stamp()});
    tx.update(gapSnap.ref, {status: 'assigned', updatedAt: stamp()});
  });
  return {ok: true};
});

export const eworkSaveFreelancer = api(async request => {
  const {records, user} = await desk(request);
  const availability = request.data.availability;
  if (!['available', 'limited', 'unavailable'].includes(availability)) throw new Error('Invalid availability');
  await records.doc(`freelancer_${user}`).set({kind: 'freelancer', name: textValue(request.data.name), skills: textValue(request.data.skills, 400),
    availability, optedIn: request.data.optedIn === true, updatedAt: stamp()}, {merge: true});
  return {id: `freelancer_${user}`};
});

export const eworkProposeMatches = api(async request => {
  const {db, records, user} = await desk(request);
  const briefRef = records.doc(identifier(request.data.briefId));
  const people = await records.where('kind', '==', 'freelancer').limit(50).get();
  await db.runTransaction(async tx => {
    const brief = (await tx.get(briefRef)).data();
    const matches = proposeMatches(brief, people.docs.map(doc => ({...doc.data(), id: doc.id})));
    matches.slice(0, 10).forEach(match => {
      const id = `match_${createHash('sha256').update(`${briefRef.id}:${match.freelancerId}`).digest('hex').slice(0, 24)}`;
      tx.set(records.doc(id), {kind: 'match', briefId: briefRef.id, freelancerId: match.freelancerId, name: match.name,
        reason: match.reason, score: match.score, status: 'proposed', createdBy: user, updatedAt: stamp()}, {merge: true});
    });
  });
  return {ok: true};
});

export const eworkApproveMatch = api(async request => {
  const {db, org, records, user} = await desk(request);
  const matchRef = records.doc(identifier(request.data.id));
  const engagementId = `engagement_${matchRef.id}`;
  await db.runTransaction(async tx => {
    const matchSnap = await tx.get(matchRef);
    const match = matchSnap.data();
    tx.update(matchRef, {...approveMatch(match), updatedAt: stamp()});
    tx.set(records.doc(engagementId), {kind: 'engagement', name: match.name, matchId: matchRef.id, briefId: match.briefId,
      freelancerId: match.freelancerId, status: 'approved', createdBy: user, createdAt: stamp(), updatedAt: stamp()});
    tx.set(org.collection('events').doc(`ework_${engagementId}`), {type: 'ework.engagement_approved', engagementId, createdAt: stamp()});
  });
  return {id: engagementId};
});

export const eworkAddMilestone = api(async request => {
  const {db, records, user} = await desk(request);
  const milestone = buildMilestone(request.data);
  const id = identifier(request.data.id || randomUUID());
  await db.runTransaction(async tx => {
    const engagement = await tx.get(records.doc(milestone.engagementId));
    if (!engagement.exists || engagement.data().kind !== 'engagement' || engagement.data().status === 'completed') throw new Error('Select an open engagement');
    tx.create(records.doc(id), {...milestone, createdBy: user, createdAt: stamp(), updatedAt: stamp()});
    tx.update(engagement.ref, {status: 'in_progress', milestoneCount: (engagement.data().milestoneCount || 0) + 1, updatedAt: stamp()});
  });
  return {id};
});

export const eworkSubmitMilestone = api(async request => {
  const {records, user} = await desk(request);
  const ref = records.doc(identifier(request.data.id));
  const data = (await ref.get()).data();
  const engagement = data && (await records.doc(data.engagementId).get()).data();
  if (!engagement || engagement.freelancerId !== `freelancer_${user}`) throw new HttpsError('permission-denied', 'Only the assigned freelancer can submit this milestone');
  await ref.update({...submitMilestone(data), updatedAt: stamp()});
  await records.doc(data.engagementId).update({status: 'awaiting_acceptance', updatedAt: stamp()});
  return {ok: true};
});

export const eworkAcceptMilestone = api(async request => {
  const {db, records} = await desk(request);
  const ref = records.doc(identifier(request.data.id));
  await db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    const data = snap.data();
    const engagement = await tx.get(records.doc(data.engagementId));
    tx.update(ref, {...acceptMilestone(data), updatedAt: stamp()});
    tx.update(engagement.ref, {...acceptanceProgress(engagement.data(), true), updatedAt: stamp()});
  });
  return {ok: true};
});
