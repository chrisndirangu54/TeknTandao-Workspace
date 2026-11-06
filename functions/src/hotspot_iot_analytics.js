// Authenticated IoT gateway telemetry, tenant-scoped and bounded.
// Device secrets are returned once at registration; they are not exposed to clients.
import {randomUUID,randomBytes,createHmac,timingSafeEqual} from 'node:crypto';
import {getFirestore,FieldValue} from 'firebase-admin/firestore';
import {onCall,onRequest,HttpsError} from 'firebase-functions/v2/https';
import {scoreHotspotAnomaly,classifyEnvironmentalRisk} from './hotspot_sponsored_domain.js';
const valid=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{5,100}$/.test(x);
const fail=(code,msg)=>{throw new HttpsError(code,msg);};
const base=org=>getFirestore().collection('organizations').doc(org).collection('hotspotV2').doc('control');
const finite=(x,min,max)=>typeof x==='number'&&Number.isFinite(x)&&x>=min&&x<=max;
const fields=['orgId','deviceId','siteId','eventId','observedAtMs','metrics'];
const metrics=['temperatureC','humidityPercent','batteryPercent','signalDbm','latencyMs','packetLossPercent','clientCount','wanUp','rainMm24h','windKph'];
async function operator(req){
 if(!req.auth||!valid(req.data?.orgId))fail('unauthenticated','Valid sign-in and organization required');
 const member=await getFirestore().collection('organizations').doc(req.data.orgId).collection('members').doc(req.auth.uid).get();
 if(!member.exists||!['owner','admin'].includes(member.data()?.role))fail('permission-denied','Admin required');
 return base(req.data.orgId);
}
export const hotspotV2RegisterIoTDevice=onCall({region:'europe-west1'},async req=>{
 if(!req.data||Object.keys(req.data).some(k=>!['orgId','siteId','label'].includes(k))||!valid(req.data.siteId)||
 typeof req.data.label!=='string'||req.data.label.length<3||req.data.label.length>80)fail('invalid-argument','Invalid device registration');
 const space=await operator(req),site=await space.collection('sites').doc(req.data.siteId).get();
 if(!site.exists)fail('failed-precondition','Site not found');
 const deviceId=randomUUID(),secret=randomBytes(32).toString('hex');
 await space.collection('iotDevices').doc(deviceId).create({siteId:site.id,label:req.data.label,secret,enabled:true,
  createdBy:req.auth.uid,createdAt:FieldValue.serverTimestamp(),lastHeartbeatAt:null});
 return {deviceId,oneTimeSecret:secret,privacy:'Private site telemetry only; do not collect user MAC, phone or browsing history'};
});
export const hotspotV2IoTIngest=onRequest({region:'europe-west1',invoker:'public',timeoutSeconds:12,maxInstances:10},async(req,res)=>{
 res.set('Cache-Control','no-store');
 if(req.method!=='POST'||!Buffer.isBuffer(req.rawBody)||req.rawBody.length>4096){res.status(405).end();return;}
 let input;try{input=JSON.parse(req.rawBody.toString('utf8'));}catch{res.status(400).end();return;}
 if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!fields.includes(k))||
 ![input.orgId,input.deviceId,input.siteId,input.eventId].every(valid)||
 !Number.isSafeInteger(input.observedAtMs)||Math.abs(Date.now()-input.observedAtMs)>300000||
 !input.metrics||typeof input.metrics!=='object'||Array.isArray(input.metrics)||
 Object.keys(input.metrics).length===0||Object.keys(input.metrics).some(k=>!metrics.includes(k))){res.status(400).end();return;}
 const m=input.metrics;
 if(Object.entries(m).some(([k,v])=>
  k==='wanUp'?typeof v!=='boolean':
  k==='clientCount'?!Number.isSafeInteger(v)||v<0||v>100000:
  k==='temperatureC'?!finite(v,-50,100):
  k==='humidityPercent'?!finite(v,0,100):
  k==='batteryPercent'?!finite(v,0,100):
  k==='signalDbm'?!finite(v,-160,20):
  k==='latencyMs'?!finite(v,0,600000):
  k==='packetLossPercent'?!finite(v,0,100):
  k==='rainMm24h'?!finite(v,0,1000):
  k==='windKph'?!finite(v,0,350):true)){res.status(400).end();return;}
 const space=base(input.orgId),device=space.collection('iotDevices').doc(input.deviceId);
 try{
  const registered=await device.get();
  if(!registered.exists||registered.data().enabled!==true||registered.data().siteId!==input.siteId){res.status(403).end();return;}
  const sent=req.get('x-hotspot-iot-signature')||'';
  if(!/^[a-f0-9]{64}$/i.test(sent)){res.status(401).end();return;}
  const expected=createHmac('sha256',registered.data().secret).update(req.rawBody).digest();
  if(!timingSafeEqual(expected,Buffer.from(sent,'hex'))){res.status(401).end();return;}
  const event=space.collection('iotReadings').doc(input.deviceId+'_'+input.eventId);
  const risk=classifyEnvironmentalRisk({rainfallMm24h:m.rainMm24h??null,
   windKph:m.windKph??null,backupBatteryPercent:m.batteryPercent??null});
  await getFirestore().runTransaction(async tx=>{
   const existing=await tx.get(event);
   if(existing.exists)return;
   tx.create(event,{deviceId:input.deviceId,siteId:input.siteId,metrics:m,observedAtMs:input.observedAtMs,
    source:'signed_iot_device',riskFlags:risk.flags,createdAt:FieldValue.serverTimestamp()});
   tx.update(device,{lastHeartbeatAt:FieldValue.serverTimestamp(),lastEventId:input.eventId});
  });
  res.status(202).json({accepted:true,source:'signed_device_not_independent_sensor_calibration'});
 }catch{res.status(503).end();}
});
export const hotspotV2OperationsIntelligence=onCall({region:'europe-west1'},async req=>{
 if(!req.data||Object.keys(req.data).some(k=>!['orgId','siteId'].includes(k))||!valid(req.data.siteId))
  fail('invalid-argument','Invalid request');
 const space=await operator(req);
 const [site,devices,readings,ads,vouchers,requests]=await Promise.all([
   space.collection('sites').doc(req.data.siteId).get(),
   space.collection('iotDevices').where('siteId','==',req.data.siteId).limit(50).get(),
   space.collection('iotReadings').where('siteId','==',req.data.siteId).limit(100).get(),
   space.collection('sponsorCampaigns').where('siteId','==',req.data.siteId).limit(50).get(),
   space.collection('vouchers').where('siteId','==',req.data.siteId).limit(100).get(),
   space.collection('gatewayRequests').where('siteId','==',req.data.siteId).limit(100).get()]);
 if(!site.exists)fail('not-found','Site not found');
 const values=readings.docs.map(d=>d.data());
 const latest=values.sort((a,b)=>b.observedAtMs-a.observedAtMs)[0]||null;
 const failedAdmissions=0,replayedNonces=0; // not measured: omit from model interpretation
 const anomalies=scoreHotspotAnomaly({failedAdmissions,replayedNonces,
   disconnectBacklog:requests.docs.filter(d=>d.data().executed!==true).length,
   missingHeartbeatMinutes:latest?Math.max(0,(Date.now()-latest.observedAtMs)/60000):null});
 const suggestions=[];
 if(!latest)suggestions.push('No verified device telemetry received; inspect sensor connectivity');
 else {
  if(latest.metrics.wanUp===false)suggestions.push('Signed sensor reports WAN outage: verify at gateway');
  if((latest.metrics.batteryPercent??100)<20)suggestions.push('Inspect backup power and battery health');
  if((latest.metrics.packetLossPercent??0)>5)suggestions.push('High reported packet loss: inspect wireless signal and upstream links');
 }
 if(anomalies.severity==='high')suggestions.push('Review pending disconnects before admitting new sessions');
 return {siteId:req.data.siteId,source:'server_records_and_signed_iot_only',sampleLimit:100,
  telemetrySampleCount:values.length,registeredDevices:devices.size,
  lastTelemetryAtMs:latest?.observedAtMs??null,lastMetrics:latest?.metrics??null,
  sponsoredRewardCount:ads.docs.reduce((s,d)=>s+(d.data().rewardedCount||0),0),
  sponsorCampaigns:ads.size,issuedOrProvisionedVoucherCount:vouchers.docs.filter(d=>['issued','provisioned','active'].includes(d.data().state)).length,
  anomaly:anomalies,aiAssist:{model:'deterministic_rules_v1',trained:false,suggestions},
  dataQuality:{truncated:[readings,ads,vouchers,requests].some(x=>x.size===100),
    telemetryVerifiedBy:'device_hmac',independentSensorCalibration:false},
  commercialRevenueVerified:false};
});
