// Per-site gateway credentials, isolated from tenant inventory/list responses.
// Rotate independently; old bridge sessions remain until expiration/disconnect.
import {randomBytes,randomUUID} from 'node:crypto';
import {getFirestore,FieldValue} from 'firebase-admin/firestore';
import {onCall,HttpsError} from 'firebase-functions/v2/https';
const fail=(code,msg)=>{throw new HttpsError(code,msg);};
const valid=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{5,100}$/.test(x);
export const hotspotV2RotateBridgeKey=onCall({region:'europe-west1'},async req=>{
 if(!req.auth||!req.data||Object.keys(req.data).some(k=>!['orgId','siteId'].includes(k))||
 !valid(req.data.orgId)||!valid(req.data.siteId))fail('invalid-argument','Invalid request');
 const org=getFirestore().collection('organizations').doc(req.data.orgId);
 const member=await org.collection('members').doc(req.auth.uid).get();
 if(!member.exists||!['owner','admin'].includes(member.data().role))fail('permission-denied','Administrator required');
 const space=org.collection('hotspotV2').doc('control'),site=space.collection('sites').doc(req.data.siteId);
 const creds=space.collection('gatewaySecrets').doc(req.data.siteId),audit=space.collection('audit').doc(randomUUID());
 const secret=randomBytes(32).toString('hex');
 await getFirestore().runTransaction(async tx=>{
  const found=await tx.get(site);
  if(!found.exists||found.data().state!=='commissioned'||found.data().gatewayVerified!==true||
   found.data().labOnly!==true)fail('failed-precondition','Verified lab site required');
  tx.set(creds,{secret,siteId:site.id,rotatedBy:req.auth.uid,
    rotatedAt:FieldValue.serverTimestamp(),enabled:true});
  tx.create(audit,{actor:req.auth.uid,action:'gateway_bridge_key_rotated',
    target:site.id,at:FieldValue.serverTimestamp()});
 });
 return {siteId:req.data.siteId,oneTimeBridgeSecret:secret,
  note:'Store only in the private gateway environment. Rotation immediately invalidates older bridge signatures.'};
});
