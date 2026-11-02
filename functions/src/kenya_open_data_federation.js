// Server-to-server access for separately deployed products; no browser CORS or Firebase ID tokens.
import {onRequest} from 'firebase-functions/v2/https';
import {GoogleAuth} from 'google-auth-library';
import {getFirestore, FieldValue} from 'firebase-admin/firestore';
import {createHash} from 'node:crypto';
import {z} from 'zod';
import './index.js';
import {loadDataset, DATASETS} from './kenya_open_data_domain.js';

const db = getFirestore();
const region = 'europe-west1';
const known = new Set(DATASETS.map(item => item.id));
const schema = z.object({
  datasetId:z.string().min(1).max(80),
  fromYear:z.number().int().min(1960).max(2100).optional(),
  toYear:z.number().int().min(1960).max(2100).optional(),
  maxPoints:z.number().int().min(1).max(100).optional()
}).strict();

export function parseGatewayClients(raw) {
  const clients = z.array(z.object({
    email:z.string().email().endsWith('.gserviceaccount.com'),
    app:z.enum(['ardhi_insight','terraforge_labs']),
    orgId:z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/),
    datasets:z.array(z.string()).min(1).max(20),
    dailyLimit:z.number().int().min(1).max(1000).default(200)
  }).strict()).max(20).parse(JSON.parse(raw));
  for(const client of clients) {
    if(client.datasets.some(id=>!known.has(id))) throw new Error('Unknown gateway dataset grant');
  }
  if(new Set(clients.map(c=>c.email.toLowerCase())).size!==clients.length)
    throw new Error('Duplicate gateway principal');
  return clients;
}

export function grantForIdentity(clients,claims,datasetId) {
  if(!claims || claims.email_verified!==true ||
    typeof claims.email!=='string' || !claims.email.endsWith('.gserviceaccount.com'))
    return null;
  const identity=claims.email.toLowerCase();
  const client=clients.find(c=>c.email.toLowerCase()===identity);
  return client && client.datasets.includes(datasetId) ? client : null;
}

async function countUsage(client) {
  const today=new Date().toISOString().slice(0,10);
  const digest=createHash('sha256').update(client.email.toLowerCase()).digest('hex');
  const ref=db.doc('kenyaDataGatewayUsage/'+today+'_'+digest);
  return db.runTransaction(async tx=>{
    const current=await tx.get(ref);
    const count=current.exists ? Number(current.data().count||0) : 0;
    if(count >= client.dailyLimit) return false;
    tx.set(ref, {count:FieldValue.increment(1), app:client.app,orgId:client.orgId,
      date:today,updatedAt:FieldValue.serverTimestamp()}, {merge:true});
    return true;
  });
}

export const kenyaOpenDataFederation = onRequest({
  region,timeoutSeconds:30,maxInstances:10,cors:false
}, async (request,response)=>{
  response.set('Cache-Control','no-store');
  if(request.method!=='POST') return response.status(405).json({error:'method_not_allowed'});
  const audience=process.env.KENYA_DATA_GATEWAY_AUDIENCE;
  const clientJson=process.env.KENYA_DATA_CLIENTS_JSON;
  if(!audience || !clientJson) return response.status(503).json({error:'gateway_not_configured'});
  let clients,body;
  try {clients=parseGatewayClients(clientJson);body=schema.parse(request.body);}
  catch {return response.status(400).json({error:'invalid_request_or_configuration'});}
  if(!known.has(body.datasetId)) return response.status(400).json({error:'unknown_dataset'});
  const bearer=/^Bearer ([A-Za-z0-9_.-]+)$/.exec(request.get('Authorization')||'');
  if(!bearer) return response.status(401).json({error:'identity_required'});
  let claims;
  try {
    const token=await new GoogleAuth().verifyIdToken({idToken:bearer[1],audience});
    claims=token.getPayload();
  } catch {return response.status(401).json({error:'invalid_identity'});}
  const client=grantForIdentity(clients,claims,body.datasetId);
  if(!client) return response.status(403).json({error:'dataset_not_authorized'});
  try {
    if(!await countUsage(client)) return response.status(429).json({error:'daily_limit_exceeded'});
    const record=await loadDataset(body.datasetId,{
      ...(body.fromYear!==undefined ? {fromYear:body.fromYear} : {}),
      ...(body.toYear!==undefined ? {toYear:body.toYear} : {}),
      ...(body.maxPoints!==undefined ? {maxPoints:body.maxPoints} : {})
    });
    return response.status(200).json({ok:true,consumer:client.app,data:record,
      warning:'Not a parcel valuation, county economic estimate, mineral discovery or personal record.'});
  } catch {
    return response.status(503).json({error:'source_unavailable'});
  }
});
