import './index.js';
import {getFirestore} from 'firebase-admin/firestore';
import {onCall,HttpsError} from 'firebase-functions/v2/https';
import {z} from 'zod';
import {catalog,loadDataset} from './kenya_open_data_domain.js';

const db=getFirestore();
const region='europe-west1';
const orgSchema=z.string().regex(/^[A-Za-z0-9_-]{1,100}$/);
const accessSchema=z.object({orgId:orgSchema}).strict();
const querySchema=z.object({
  orgId:orgSchema, datasetId:z.string().min(1).max(100),
  fromYear:z.number().int().min(1960).max(2100).optional(),
  toYear:z.number().int().min(1960).max(2100).optional(),
  maxPoints:z.number().int().min(1).max(100).optional()
}).strict();

async function requireMembership(request,orgId) {
  if (!request.auth?.uid) throw new HttpsError('unauthenticated','Sign in required');
  const member=await db.doc('organizations/'+orgId+'/members/'+request.auth.uid).get();
  if (!member.exists || member.data()?.disabled===true) {
    throw new HttpsError('permission-denied','Workspace membership required');
  }
}
function callable(schema,handler) {
  return onCall({region,timeoutSeconds:30,maxInstances:10},async request=>{
    let data;
    try { data=schema.parse(request.data); }
    catch { throw new HttpsError('invalid-argument','Invalid Kenya Open Data request'); }
    await requireMembership(request,data.orgId);
    try { return await handler(data); }
    catch(error) {
      if (error instanceof RangeError || error instanceof TypeError)
        throw new HttpsError('invalid-argument',error.message);
      // Do not expose upstream response bodies or internal network errors.
      throw new HttpsError('unavailable','Public data source unavailable; retry later');
    }
  });
}
// Tenant membership is checked before either callable returns anything.
// No arbitrary upstream URL, microdata, personal records or cadastral lookups.
export const getKenyaOpenDataCatalog = callable(accessSchema,async()=>catalog());
export const getKenyaOpenDataDataset = callable(querySchema,async data=>
  loadDataset(data.datasetId,{
    fromYear:data.fromYear,
    toYear:data.toYear,
    maxPoints:data.maxPoints
  }));
