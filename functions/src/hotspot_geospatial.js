// NASA POWER geospatial environmental enrichment: provider-sourced historical
// gridded estimates, NOT live satellite imagery, router telemetry or a site weather station.
import {randomUUID} from 'node:crypto';
import {getFirestore,FieldValue} from 'firebase-admin/firestore';
import {onCall,HttpsError} from 'firebase-functions/v2/https';
const fail=(code,msg)=>{throw new HttpsError(code,msg);};
const valid=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{5,100}$/.test(x);
const root=org=>getFirestore().collection('organizations').doc(org).collection('hotspotV2').doc('control');
async function admin(req){
 if(!req.auth||!valid(req.data?.orgId))fail('unauthenticated','Sign in and organization required');
 const membership=await getFirestore().collection('organizations').doc(req.data.orgId).collection('members').doc(req.auth.uid).get();
 if(!membership.exists||!['owner','admin'].includes(membership.data()?.role))fail('permission-denied','Administrator required');
 return root(req.data.orgId);
}
const call=fn=>onCall({region:'europe-west1',timeoutSeconds:45},fn);
export const hotspotV2SetSiteCoordinates=call(async req=>{
 if(!req.data||Object.keys(req.data).some(k=>!['orgId','siteId','latitude','longitude','accuracyStatement'].includes(k)))
  fail('invalid-argument','Invalid coordinates');
 const space=await admin(req),{siteId,latitude,longitude,accuracyStatement}=req.data;
 if(!valid(siteId)||!Number.isFinite(latitude)||latitude< -90||latitude>90||
  !Number.isFinite(longitude)||longitude< -180||longitude>180||
  typeof accuracyStatement!=='string'||accuracyStatement.trim().length<8||accuracyStatement.length>300)
  fail('invalid-argument','Coordinates and measurement provenance required');
 const ref=space.collection('sites').doc(siteId),audit=space.collection('audit').doc(randomUUID());
 const snap=await ref.get();if(!snap.exists)fail('not-found','Site not found');
 const batch=getFirestore().batch();
 batch.update(ref,{coordinates:{latitude,longitude,source:accuracyStatement.trim(),
  recordedAt:FieldValue.serverTimestamp()},updatedAt:FieldValue.serverTimestamp()});
 batch.create(audit,{actor:req.auth.uid,action:'site_coordinates_updated',target:siteId,at:FieldValue.serverTimestamp()});
 await batch.commit();
 return {ok:true,geolocationVerifiedExternally:false};
});
export const hotspotV2RefreshNasaPower=call(async req=>{
 if(!req.data||Object.keys(req.data).some(k=>!['orgId','siteId'].includes(k))||!valid(req.data.siteId))
  fail('invalid-argument','Invalid request');
 const space=await admin(req),site=await space.collection('sites').doc(req.data.siteId).get();
 if(!site.exists)fail('not-found','Site missing');
 const {latitude,longitude}=site.data().coordinates||{};
 if(!Number.isFinite(latitude)||!Number.isFinite(longitude))fail('failed-precondition','Set site coordinates first');
 const cache=space.collection('environmentSnapshots').doc(req.data.siteId),old=await cache.get();
 if(old.exists&&old.data().fetchedAt?.toMillis?.()&&Date.now()-old.data().fetchedAt.toMillis()<24*3600000)
  return {siteId:site.id,cached:true,source:old.data().source,summary:old.data().summary,
   latestDataDate:old.data().latestDataDate,latestFetch:old.data().fetchedAt.toDate().toISOString()};
 // Lag several days to avoid incorrectly classifying provider latency as absence.
 const end=new Date(Date.now()-7*86400000),start=new Date(Date.now()-14*86400000);
 const stamp=d=>d.toISOString().slice(0,10).replaceAll('-','');
 const url=new URL('https://power.larc.nasa.gov/api/temporal/daily/point');
 for(const [k,v] of Object.entries({parameters:'T2M,PRECTOTCORR,WS10M,ALLSKY_SFC_SW_DWN',
   community:'RE',latitude:String(latitude),longitude:String(longitude),
   start:stamp(start),end:stamp(end),format:'JSON'}))url.searchParams.set(k,v);
 let data;
 try{
  const res=await fetch(url,{signal:AbortSignal.timeout(18000),headers:{accept:'application/json'}});
  if(!res.ok)throw new Error('NASA POWER unavailable');
  data=await res.json();
 }catch{fail('unavailable','NASA POWER environmental data not reachable');}
 const p=data?.properties?.parameter;
 if(!p||typeof p!=='object')fail('data-loss','Unexpected provider data');
 const usable=x=>typeof x==='number'&&Number.isFinite(x)&&x> -900;
 const aggregate=name=>{
  const values=Object.entries(p[name]||{}).filter(([d,v])=>/^\d{8}$/.test(d)&&usable(v));
  return {mean:values.length?values.reduce((s,[,v])=>s+v,0)/values.length:null,
   samples:values.length,latestDate:values.length?values.map(x=>x[0]).sort().at(-1):null};
 };
 const fields={temperatureC:aggregate('T2M'),precipitationMmPerDay:aggregate('PRECTOTCORR'),
   windMps:aggregate('WS10M'),solarKwhM2PerDay:aggregate('ALLSKY_SFC_SW_DWN')};
 const summary={temperatureC:fields.temperatureC.mean,precipitationMmPerDay:fields.precipitationMmPerDay.mean,
   windMps:fields.windMps.mean,solarKwhM2PerDay:fields.solarKwhM2PerDay.mean,
   samples:Object.fromEntries(Object.entries(fields).map(([k,v])=>[k,v.samples]))};
 if(Object.values(fields).every(x=>x.samples===0))fail('data-loss','No valid observations');
 const latestDataDate=fields.temperatureC.latestDate||fields.solarKwhM2PerDay.latestDate;
 await cache.set({siteId:site.id,coordinates:{latitude,longitude},
  source:'NASA_POWER_daily_gridded_historical',summary,latestDataDate,
  sampledWindow:{start:stamp(start),end:stamp(end)},fetchedAt:FieldValue.serverTimestamp()});
 return {siteId:site.id,cached:false,source:'NASA_POWER_daily_gridded_historical',summary,latestDataDate,
  caveat:'Historical gridded satellite/model-derived information; not real-time site measurements or satellite images'};
});
