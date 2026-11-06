// Pure accounting normalizer; only signed RADIUS bridge can submit.
const id=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{5,100}$/.test(x);
export function normalizeV2Session(input,now=Date.now()){
 if(!input||typeof input!=='object'||Array.isArray(input)||
 Object.keys(input).some(k=>!['orgId','siteId','nasId','voucherId','sessionId','eventId','type','observedAtMs','inputOctets','outputOctets','nonce'].includes(k))||
 ![input.orgId,input.siteId,input.nasId,input.voucherId,input.sessionId,input.eventId,input.nonce].every(id))throw new Error('Invalid identities');
 if(!['start','interim','stop'].includes(input.type))throw new Error('Invalid event type');
 for(const field of ['observedAtMs','inputOctets','outputOctets'])
  if(!Number.isSafeInteger(input[field])||input[field]<0)throw new Error('Invalid accounting counters');
 if(Math.abs(input.observedAtMs-now)>5*60000)throw new Error('Event outside clock tolerance');
 return Object.freeze({...input,source:'signed_radius_bridge',independentlyNasAttested:false});
}
export function sessionKey({siteId,voucherId,sessionId}){
 if(![siteId,voucherId,sessionId].every(id))throw new Error('Bad session scope');
 return siteId+'__'+voucherId+'__'+sessionId;
}
