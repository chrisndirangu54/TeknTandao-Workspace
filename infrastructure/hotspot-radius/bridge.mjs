// Private FreeRADIUS rlm_rest bridge. No direct end-user access.
// Runs on isolated internal network; signs requests to Workspace authorization.
import http from 'node:http';
import {randomBytes,createHmac} from 'node:crypto';
const endpoint=process.env.HOTSPOT_AUTHORIZATION_URL;
const secret=process.env.HOTSPOT_RADIUS_BRIDGE_HMAC_KEY;
const accountingEndpoint=process.env.HOTSPOT_ACCOUNTING_URL;
const orgId=process.env.HOTSPOT_ORG_ID,siteId=process.env.HOTSPOT_SITE_ID,nasId=process.env.HOTSPOT_NAS_ID;
const bindHost=process.env.HOTSPOT_BRIDGE_HOST||'127.0.0.1';
const port=Number(process.env.HOTSPOT_BRIDGE_PORT||8080);
if(!endpoint||!/^https:\/\//.test(endpoint)||!secret||secret.length<32||
 ![orgId,siteId,nasId].every(x=>typeof x==='string'&&/^[A-Za-z0-9_-]{5,100}$/.test(x))||
 !Number.isSafeInteger(port)||port<1024||port>65535)
 throw new Error('Configure HTTPS authorization endpoint, secret >=32 chars, org/site/NAS IDs and valid port');
const extract=(body,key)=>{
 const attr=body?.[key];
 if(typeof attr==='string')return attr;
 if(typeof attr?.value?.[0]==='string')return attr.value[0];
 return null;
};
const server=http.createServer(async(req,res)=>{
 res.setHeader('Cache-Control','no-store');
 if(req.method!=='POST'||!['/authorize','/accounting'].includes(req.url)){res.writeHead(404).end();return;}
 let data='';
 for await(const chunk of req){
  data+=chunk.toString('utf8');
  if(data.length>4096){res.writeHead(413).end();return;}
 }
 try{
  if(req.url==='/accounting'){
    if(!accountingEndpoint||!/^https:\/\//.test(accountingEndpoint)){res.writeHead(503).end();return;}
    const radius=JSON.parse(data);
    const voucherId=extract(radius,'User-Name'),sessionId=extract(radius,'Acct-Session-Id');
    const type=String(extract(radius,'Acct-Status-Type')||'').toLowerCase();
    const inputOctets=Number(extract(radius,'Acct-Input-Octets')||0);
    const outputOctets=Number(extract(radius,'Acct-Output-Octets')||0);
    if(!voucherId||!sessionId||!/^[A-Za-z0-9_-]{5,100}$/.test(voucherId)||
      !/^[A-Za-z0-9_-]{5,100}$/.test(sessionId)||
      !['start','interim-update','stop'].includes(type)||
      ![inputOctets,outputOctets].every(x=>Number.isSafeInteger(x)&&x>=0)){
      res.writeHead(400).end();return;
    }
    const payload=Buffer.from(JSON.stringify({orgId,siteId,nasId,voucherId,sessionId,
      eventId:randomBytes(12).toString('hex'),nonce:randomBytes(12).toString('hex'),
      type:type==='interim-update'?'interim':type,observedAtMs:Date.now(),inputOctets,outputOctets}));
    const timestamp=String(Date.now()),signature=createHmac('sha256',secret)
      .update(timestamp).update('.').update(payload).digest('hex');
    const upstream=await fetch(accountingEndpoint,{method:'POST',headers:{
      'content-type':'application/json','x-hotspot-timestamp':timestamp,'x-hotspot-signature':signature
    },body:payload,signal:AbortSignal.timeout(5000)});
    res.writeHead(upstream.ok?200:503).end();
    return;
  }
  const radius=JSON.parse(data),voucherId=extract(radius,'User-Name'),code=extract(radius,'User-Password');
  if(!voucherId||!/^[A-Za-z0-9_-]{5,100}$/.test(voucherId)||!code||!/^[a-fA-F0-9]{32}$/.test(code)){
   res.writeHead(403).end();return;
  }
  const body=Buffer.from(JSON.stringify({orgId,siteId,nasId,voucherId,code,nonce:randomBytes(12).toString('hex')}));
  const timestamp=String(Date.now());
  const signature=createHmac('sha256',secret).update(timestamp).update('.').update(body).digest('hex');
  const upstream=await fetch(endpoint,{method:'POST',headers:{
    'content-type':'application/json','x-hotspot-timestamp':timestamp,'x-hotspot-signature':signature
   },body,signal:AbortSignal.timeout(5000)});
  if(!upstream.ok){res.writeHead(403).end();return;}
  const reply=await upstream.json();
  if(reply.accepted!==true||!reply.reply||!Number.isSafeInteger(reply.reply['Session-Timeout'])||
    !/^[0-9]+M\/[0-9]+M$/.test(reply.reply['Mikrotik-Rate-Limit']||'')){
   res.writeHead(403).end();return;
  }
  res.writeHead(200,{'content-type':'application/json'});
  res.end(JSON.stringify({
   'Session-Timeout':{'op':':=','value':reply.reply['Session-Timeout']},
   'Mikrotik-Rate-Limit':{'op':':=','value':reply.reply['Mikrotik-Rate-Limit']}
  }));
 }catch{res.writeHead(503).end();}
});
server.listen(port,bindHost);
