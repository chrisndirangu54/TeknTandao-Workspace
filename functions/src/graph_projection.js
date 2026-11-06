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

export const projectBusinessGraph = onDocumentWritten({
  document: 'organizations/{orgId}/{collectionId}/{docId}',
  region,
  retry: true,
}, async event => {
  const after = event.data?.after;
  if (!after?.exists) return;
  const raw = after.data();
  const projected = projectGraphNode(event.params.collectionId, event.params.docId, raw);
  if (!projected) return;

  const node = validateGraphNode(projected);
  const org = db.doc(`organizations/${event.params.orgId}`);
  const nodeId = graphNodeId(node);
  const batch = db.batch();
  batch.set(org.collection('businessGraphNodes').doc(nodeId), {
    ...node,
    nodeId,
    projectionSource: `${event.params.collectionId}/${event.params.docId}`,
    projected: true,
    updatedAt: stamp(),
  }, {merge: true});

  for (const rawEdge of projectedGraphEdges(event.params.collectionId, event.params.docId, raw)) {
    const edge = validateGraphEdge(rawEdge);
    const id = edgeId(edge);
    batch.set(org.collection('businessGraphEdges').doc(id), {
      ...edge,
      edgeId: id,
      projectionSource: `${event.params.collectionId}/${event.params.docId}`,
      projected: true,
      updatedAt: stamp(),
    }, {merge: true});
  }

  await batch.commit();
});
