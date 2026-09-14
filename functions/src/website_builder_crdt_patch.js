import './index.js';
import {randomUUID} from 'node:crypto';
import {FieldValue, Timestamp, getFirestore} from 'firebase-admin/firestore';
import {HttpsError, onCall} from 'firebase-functions/v2/https';
import {canAccess, identifier} from './domain.js';
import {applyWebsitePatch, validateWebsiteDocument, validateWebsitePatch, websiteDigest} from './website_builder_domain.js';

const db = getFirestore();
const region = 'europe-west1';
const websiteAppId = 'mc14_website_builder';
const stamp = () => FieldValue.serverTimestamp();
const orgRoot = orgId => db.doc(`organizations/${identifier(orgId)}`);

function uid(request) {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in first');
  return request.auth.uid;
}

async function authorize(request) {
  const user = uid(request);
  const org = orgRoot(request.data.orgId);
  const member = (await org.collection('members').doc(user).get()).data();
  if (!member) throw new HttpsError('permission-denied', 'Organization access denied');
  const installation = (await org.collection('apps').doc(websiteAppId).get()).data();
  if (!canAccess(member, websiteAppId, installation)) throw new HttpsError('permission-denied', 'Website Builder subscription or permission required');
  return {org, user};
}

/**
 * Compatibility endpoint for the existing visual editor. Every semantic patch
 * becomes an immutable OpSet-CRDT operation. The transaction also applies that
 * patch to the latest materialized document immediately so existing clients
 * preserve their synchronous revision contract. The collaboration trigger then
 * replays the complete operation set in deterministic Lamport/actor order,
 * making every replica converge even when calls arrive in a different order.
 */
export const patchWebsiteProject = onCall({region}, async request => {
  try {
    const {org, user} = await authorize(request);
    const projectId = identifier(request.data.projectId);
    const patch = validateWebsitePatch(request.data.patch);
    const actorId = identifier(request.data.actorId || user);
    const projectRef = org.collection('websiteProjects').doc(projectId);
    const stateRef = org.collection('websiteCollaboration').doc(projectId);
    const actorRef = stateRef.collection('actors').doc(actorId);
    const opId = identifier(request.data.opId || `op_${randomUUID()}`);
    const opRef = stateRef.collection('ops').doc(opId);

    return await db.runTransaction(async tx => {
      const [project, state, actor, duplicate] = await Promise.all([
        tx.get(projectRef), tx.get(stateRef), tx.get(actorRef), tx.get(opRef)
      ]);
      if (!project.exists) throw new Error('Website project not found');
      if (duplicate.exists) {
        return {accepted: true, duplicate: true, opId, epoch: duplicate.data().epoch, clock: duplicate.data().clock, revision: project.data().revision || 1};
      }
      const epoch = state.exists ? Number(state.data().epoch || 1) : 1;
      const explicitEpoch = request.data.epoch;
      if (explicitEpoch != null && explicitEpoch !== epoch) throw new Error(`Collaboration epoch changed to ${epoch}; refresh before editing`);
      const serverClock = Number(actor.data()?.clock || 0) + 1;
      const suppliedClock = Number(request.data.clock || 0);
      const clock = Number.isSafeInteger(suppliedClock) && suppliedClock > serverClock ? suppliedClock : serverClock;
      const operation = {actorId, opId, clock, epoch, patch, projectId, uid: user, createdAt: stamp()};
      const currentDocument = validateWebsiteDocument(project.data().draft);
      const nextDocument = applyWebsitePatch(currentDocument, patch);
      const revision = Number(project.data().revision || 0) + 1;

      if (!state.exists) {
        tx.create(stateRef, {
          projectId,
          epoch,
          base: currentDocument,
          materializedOpCount: 0,
          materializedOpSetHash: '',
          createdAt: stamp()
        });
      }
      tx.set(actorRef, {actorId, uid: user, clock, epoch, updatedAt: stamp()}, {merge: true});
      tx.create(opRef, operation);
      tx.set(stateRef.collection('presence').doc(actorId), {
        actorId,
        uid: user,
        selectedNodeId: request.data.selectedNodeId ? identifier(request.data.selectedNodeId) : null,
        updatedAt: stamp(),
        expiresAt: Timestamp.fromMillis(Date.now() + 90000)
      }, {merge: true});
      tx.update(projectRef, {
        draft: nextDocument,
        title: nextDocument.title,
        revision,
        collaborationEpoch: epoch,
        status: project.data().publishedVersion ? 'modified' : 'draft',
        updatedBy: user,
        updatedAt: stamp()
      });
      tx.set(org.collection('websiteProjectEvents').doc(`${projectId}_${revision}`), {
        projectId,
        revision,
        kind: 'crdt_patch',
        opId,
        actorId,
        clock,
        epoch,
        digest: websiteDigest(nextDocument),
        patch,
        actorUid: user,
        createdAt: stamp()
      });
      return {accepted: true, opId, actorId, epoch, clock, revision, digest: websiteDigest(nextDocument)};
    });
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    throw new HttpsError('failed-precondition', String(error?.message || 'Website collaboration patch failed').slice(0, 1000));
  }
});
