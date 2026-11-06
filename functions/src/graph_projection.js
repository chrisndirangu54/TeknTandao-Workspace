import './index.js';
import {createHash} from 'node:crypto';
import {FieldValue, getFirestore} from 'firebase-admin/firestore';
import {onDocumentWritten} from 'firebase-functions/v2/firestore';
import {graphNodeId, validateGraphEdge, validateGraphNode} from './sota_domain.js';
import {projectGraphNode, projectedGraphEdges} from './graph_projection_domain.js';

const db = getFirestore();
const region = 'europe-west1';
const stamp = () => FieldValue.serverTimestamp();

function edgeId(edge) {
  return createHash('sha256')
    .update(`${edge.from}|${edge.relation}|${edge.to}`)
    .digest('hex')
    .slice(0, 40);
}

function projectionFingerprint(collectionId, docId, raw) {
  const projected = projectGraphNode(collectionId, docId, raw);
  if (!projected) return null;
  const node = validateGraphNode(projected);
  const edges = projectedGraphEdges(collectionId, docId, raw)
    .map(validateGraphEdge)
    .sort((a, b) => `${a.from}|${a.relation}|${a.to}`.localeCompare(`${b.from}|${b.relation}|${b.to}`));
  return createHash('sha256')
    .update(JSON.stringify({node, edges}))
    .digest('hex');
}

export const projectBusinessGraph = onDocumentWritten({
  document: 'organizations/{orgId}/{collectionId}/{docId}',
  region,
  retry: true,
}, async event => {
  const after = event.data?.after;
  if (!after?.exists) return;
  const raw = after.data();
  const collectionId = event.params.collectionId;
  const docId = event.params.docId;
  const projected = projectGraphNode(collectionId, docId, raw);
  if (!projected) return;

  // Operational writes often update metadata such as updatedAt, agent ids or
  // sync receipts without changing the graph-visible business entity. Skip the
  // projection completely when the graph node + edges are identical. This
  // removes a large class of duplicate Firestore writes and trigger fan-out.
  const before = event.data?.before;
  if (before?.exists) {
    const beforeFingerprint = projectionFingerprint(collectionId, docId, before.data());
    const afterFingerprint = projectionFingerprint(collectionId, docId, raw);
    if (beforeFingerprint && beforeFingerprint === afterFingerprint) return;
  }

  const node = validateGraphNode(projected);
  const org = db.doc(`organizations/${event.params.orgId}`);
  const nodeId = graphNodeId(node);
  const batch = db.batch();
  batch.set(org.collection('businessGraphNodes').doc(nodeId), {
    ...node,
    nodeId,
    projectionSource: `${collectionId}/${docId}`,
    projected: true,
    updatedAt: stamp(),
  }, {merge: true});

  for (const rawEdge of projectedGraphEdges(collectionId, docId, raw)) {
    const edge = validateGraphEdge(rawEdge);
    const id = edgeId(edge);
    batch.set(org.collection('businessGraphEdges').doc(id), {
      ...edge,
      edgeId: id,
      projectionSource: `${collectionId}/${docId}`,
      projected: true,
      updatedAt: stamp(),
    }, {merge: true});
  }

  await batch.commit();
});
