// Dedicated, privileged NAS Disconnect-Request executor.
// NEVER run this process with frontend credentials or on a public host.
// Prerequisites: GOOGLE_APPLICATION_CREDENTIALS, local radclient, NAS shared
// secret in a 0600 file, private NAS IP, and approved Firestore disconnects.
import {initializeApp,applicationDefault} from 'firebase-admin/app';
import {getFirestore,FieldValue} from 'firebase-admin/firestore';
import {spawn} from 'node:child_process';
import {statSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import net from 'node:net';
const org=process.env.HOTSPOT_ORG_ID,site=process.env.HOTSPOT_SITE_ID;
const nasId=process.env.HOTSPOT_NAS_ID,nasIp=process.env.HOTSPOT_NAS_PRIVATE_IP;
const secretFile=process.env.HOTSPOT_NAS_SECRET_FILE;
const live=process.env.HOTSPOT_DISCONNECT_ENABLED==='true';
const valid=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{5,100}$/.test(x);
const privateV4=ip=>{
 if(net.isIP(ip)!==4)return false;
 const [a,b]=ip.split('.').map(Number);
 return a===10||(a===172&&b>=16&&b<=31)||(a===192&&b===168);
};
if(![org,site,nasId].every(valid)||!privateV4(nasIp)||!secretFile)
 throw new Error('Configure org, site, NAS and private IPv4 address; public NAS targets prohibited');
if(live&&((statSync(secretFile).mode&0o077)!==0))
 throw new Error('NAS secret file must not be accessible by group or others');
initializeApp({credential:applicationDefault()});
const firestore=getFirestore(),root=firestore.collection('organizations').doc(org).collection('hotspotV2').doc('control');
const requests=root.collection('gatewayRequests');
async function radDisconnect(session){
 // Every attribute is validated, and radclient uses a local secret file.
 for(const name of ['voucherId','sessionId'])
  if(!valid(session[name]))throw new Error('Invalid accounting attributes');
 const payload='User-Name = "'+session.voucherId+'"\nAcct-Session-Id = "'+session.sessionId+'"\n';
 return new Promise((resolve,reject)=>{
  const child=spawn('radclient',['-S',secretFile,'-r','1','-t','2',
    nasIp+':3799','disconnect'],{stdio:['pipe','pipe','pipe'],shell:false});
  let out='',err='';
  child.stdout.on('data',chunk=>{out+=chunk.toString().slice(0,2048);});
  child.stderr.on('data',chunk=>{err+=chunk.toString().slice(0,2048);});
  const timer=setTimeout(()=>child.kill('SIGKILL'),7000);
  child.on('error',reject);
  child.on('close',code=>{
   clearTimeout(timer);
   if(code===0&&/Disconnect-ACK/i.test(out))resolve({ack:true});
   else reject(new Error('Missing valid NAS Disconnect-ACK'));
  });
  child.stdin.end(payload);
 });
}
async function execute(ref){
 const attempt=randomUUID(),now=Date.now();
 let request;
 await firestore.runTransaction(async tx=>{
  const current=await tx.get(ref);
  if(!current.exists||current.data().state!=='approved_not_executed'||current.data().executed===true)return;
  request=current.data();
  if(request.operation!=='disconnect'||request.siteId!==site||
   !request.approvedBy||!request.requestedBy||request.approvedBy===request.requestedBy)
   throw new Error('Invalid approval');
  tx.update(ref,{state:live?'executing':'dry_run',attemptId:attempt,
   attemptedAt:FieldValue.serverTimestamp(),executed:false});
 });
 if(!request)return;
 const voucher=await root.collection('vouchers').doc(request.voucherId).get();
 if(!voucher.exists||voucher.data().state!=='revoked'||voucher.data().siteId!==site)
  throw new Error('Voucher scope changed');
 const target=await root.collection('sites').doc(site).get();
 if(!target.exists||target.data().nasId!==nasId||target.data().gatewayVerified!==true)
  throw new Error('NAS is not registered and attested');
 if(!live){
  await ref.update({state:'approved_not_executed',lastDryRunAt:FieldValue.serverTimestamp(),executed:false});
  return;
 }
 const snapshot=await root.collection('gatewaySessions').where('voucherId','==',request.voucherId).limit(100).get();
 const active=snapshot.docs.filter(d=>d.data().state==='open'&&
   d.data().siteId===site&&d.data().nasId===nasId);
 if(!active.length)throw new Error('No matching signed active session; manual review needed');
 for(const session of active){
  await radDisconnect({voucherId:request.voucherId,sessionId:session.data().sessionId});
  await session.ref.update({state:'disconnect_acknowledged',lastDisconnectAttempt:attempt,
    updatedAt:FieldValue.serverTimestamp()});
 }
 await firestore.runTransaction(async tx=>{
  const fresh=await tx.get(ref);
  if(!fresh.exists||fresh.data().attemptId!==attempt||
   fresh.data().state!=='executing')throw new Error('Lost execution lease');
  tx.update(ref,{state:'executed',executed:true,ackCount:active.length,
   executedAt:FieldValue.serverTimestamp(),executedBy:'nas_worker'});
  tx.create(root.collection('audit').doc(randomUUID()),{actor:'nas_worker',action:'disconnect_ack',
    resource:ref.id,ackCount:active.length,at:FieldValue.serverTimestamp()});
 });
}
async function tick(){
 const snapshot=await requests.where('state','==','approved_not_executed').limit(25).get();
 for(const ref of snapshot.docs){
  if(ref.data().siteId!==site)continue;
  try{await execute(ref.ref);}
  catch(error){
   // Do not retry blindly; a lost ACK could represent a successful packet.
   await ref.ref.update({state:'needs_manual_review',executed:false,
     lastError:'Gateway ACK missing or execution incomplete',updatedAt:FieldValue.serverTimestamp()});
   console.error('Disconnect requires manual reconciliation',ref.id);
  }
 }
}
console.log('Hotspot Disconnect Worker: enabled=',live,'site=',site);
while(true){
 try{await tick();}catch{console.error('Unable to poll approved disconnects');}
 await new Promise(resolve=>setTimeout(resolve,20000));
}
