// Namecheap domain reseller (sandbox discovery) and hosting sales request intake.
// No unattended domain registration, registrar charges, or WHM account creation.
import './index.js';
import {randomUUID} from 'node:crypto';
import {getFirestore,FieldValue} from 'firebase-admin/firestore';
import {onCall,HttpsError} from 'firebase-functions/v2/https';
import {defineSecret} from 'firebase-functions/params';
import {z} from 'zod';
import {identifier} from './domain.js';
import {domainSchema,domainOrderSchema,hostingOrderSchema,
  parseDomainCheck,parseDomainPrice} from './namecheap_domain.js';

const db=getFirestore(),region='europe-west1';
const apiKey=defineSecret('NAMECHEAP_SANDBOX_API_KEY');
const apiUser=defineSecret('NAMECHEAP_SANDBOX_API_USER');
const apiClientIp=defineSecret('NAMECHEAP_SANDBOX_CLIENT_IP');
// Production credentials deliberately not wired until a static egress IP,
// account approval and end-to-end sandbox test are completed.
async function owner(req){
 if(!req.auth)throw new HttpsError('unauthenticated','Sign in');
 const org=db.doc('organizations/'+identifier(req.data?.orgId));
 const member=await org.collection('members').doc(req.auth.uid).get();
 if(member.data()?.role!=='owner')
   throw new HttpsError('permission-denied','Workspace owner required');
 return {org,uid:req.auth.uid};
}
async function namecheap(command,args={}) {
 const username=apiUser.value(),key=apiKey.value(),ip=apiClientIp.value();
 if(!username||!key||!ip||!/^([0-9]{1,3}\.){3}[0-9]{1,3}$/.test(ip))
   throw new HttpsError('failed-precondition','Namecheap sandbox API or whitelisted egress IPv4 not configured');
 const parsed=ip.split('.').map(Number);
 if(parsed.some(n=>n>255))throw new HttpsError('failed-precondition','Invalid fixed outbound IPv4');
 const url=new URL('https://api.sandbox.namecheap.com/xml.response');
 for(const [k,v] of Object.entries({ApiUser:username,ApiKey:key,UserName:username,
  Command:command,ClientIp:ip,...args}))url.searchParams.set(k,String(v));
 const response=await fetch(url,{method:'GET',redirect:'error',
  signal:AbortSignal.timeout(12000),headers:{accept:'application/xml'}});
 if(!response.ok)throw new Error('Namecheap sandbox request unavailable');
 const body=await response.text();
 if(body.length>250000)throw new Error('Namecheap result too large');
 return body;
}
const sandboxSecrets=[apiKey,apiUser,apiClientIp];
export const namecheapCheckDomain=onCall({region,enforceAppCheck:true,
  secrets:sandboxSecrets,timeoutSeconds:30},async req=>{
 const {org}=await owner(req);
 let domain;try{domain=domainSchema.parse(req.data?.domain);}
 catch(_){throw new HttpsError('invalid-argument','Invalid domain name');}
 try{
  const response=await namecheap('namecheap.domains.check',{DomainList:domain});
  const availability=parseDomainCheck(response,domain);
  return {...availability,environment:'sandbox',liveAvailabilityVerified:false,
    priceQuote:null,orderEnabled:false,
    note:'Sandbox result is for integration testing, not a live availability or purchase guarantee.'};
 }catch(_){throw new HttpsError('unavailable',
  'Namecheap sandbox lookup unavailable; verify access and outbound static IPv4');}
});
export const namecheapGetDomainPrice=onCall({region,enforceAppCheck:true,
 secrets:sandboxSecrets,timeoutSeconds:30},async req=>{
 await owner(req);
 const tld=z.string().regex(/^[a-z]{2,24}$/).parse(req.data?.tld);
 try{
  const xml=await namecheap('namecheap.users.getPricing',{
    ProductType:'DOMAIN',ProductCategory:'DOMAINS',ActionName:'REGISTER',
    ProductName:tld.toUpperCase()});
  return {...parseDomainPrice(xml,tld),environment:'sandbox',
    note:'Registrar cost only, in USD; not a retail KES quotation or payable amount.'};
 }catch(_){throw new HttpsError('unavailable','Namecheap sandbox pricing unavailable');}
});
export const namecheapSubmitResellerRequest=onCall({region,enforceAppCheck:true},async req=>{
 const {org,uid}=await owner(req);
 const kind=z.enum(['domain','hosting']).parse(req.data?.kind);
 let details;
 try{
  details=kind==='domain'?domainOrderSchema.parse(req.data?.details):
   hostingOrderSchema.parse(req.data?.details);
 }catch(_){throw new HttpsError('invalid-argument','Invalid reseller request');}
 const id=randomUUID();
 await org.collection('namecheapResellerRequests').doc(id).create({
  id,kind,...details,provider:'namecheap',state:'awaiting_quote',
  registrarPurchaseEnabled:false,hostingProvisionEnabled:false,
  paymentVerified:false,retailPriceKes:null,
  createdBy:uid,createdAt:FieldValue.serverTimestamp()
 });
 return {id,state:'awaiting_quote',providerOrderCreated:false,
  customerCharged:false,note:'No charge placed. Await a verified live quote, confirmed settlement and operator approval.'};
});
export const namecheapListResellerRequests=onCall({region,enforceAppCheck:true},async req=>{
 const {org}=await owner(req);
 const snap=await org.collection('namecheapResellerRequests')
   .orderBy('createdAt','desc').limit(50).get();
 return {requests:snap.docs.map(d=>({id:d.id,kind:d.data().kind,
  domain:d.data().domain,packageCode:d.data().packageCode||null,
  state:d.data().state,retailPriceKes:d.data().retailPriceKes||null,
  paymentVerified:d.data().paymentVerified===true}))};
});
