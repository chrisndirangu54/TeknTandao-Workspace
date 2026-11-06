import test from 'node:test';
import assert from 'node:assert/strict';
import {esetEndpoints,validRegion,esetConnectToken,collectEsetPages,projectDevice,projectDetection} from '../src/eset_connect_client.js';

test('region is strictly allowlisted',()=>{
  assert.throws(()=>validRegion('attacker.example'),/Unsupported/);
  assert.equal(esetEndpoints('eu').devices,'https://eu.device-management.eset.systems/v1/devices');
});
test('OAuth credentials use ESET identity provider only',async()=>{
  let url='',params='';
  const token=await esetConnectToken({region:'eu',username:'apiuser',password:'topsecret',
    fetchFn:async(u,o)=>{url=u;params=o.body;return {ok:true,status:200,json:async()=>({access_token:'access'})};}});
  assert.equal(token,'access');
  assert.equal(url,'https://eu.business-account.iam.eset.systems/oauth/token');
  assert.equal(new URLSearchParams(params).get('grant_type'),'password');
});
test('pagination deduplicates tokens and stops at configured cap',async()=>{
  let n=0;
  const r=await collectEsetPages({region:'eu',kind:'devices',token:'sample',maxPages:2,
    fetchFn:async()=>({ok:true,status:200,json:async()=>({devices:[{uuid:String(++n)}],nextPageToken:'page'+n})})});
  assert.equal(r.entries.length,2);
  assert.equal(r.complete,false);
});
test('rejects ESET 202 as incomplete rather than storing partial data',async()=>{
  await assert.rejects(collectEsetPages({region:'eu',kind:'devices',token:'sample',
    fetchFn:async()=>({ok:true,status:202,json:async()=>({})})}),/pending/);
});
test('owner UUID ensures cross-tenant devices are not retained',()=>{
  assert.equal(projectDevice({uuid:'d1',ownerUuid:'tenant-b'},'tenant-a'),null);
  assert.equal(projectDevice({uuid:'d1',ownerUuid:'tenant-a',displayName:'Example'},'tenant-a').name,'Example');
});
test('detections only project for explicitly assigned device UUIDs',()=>{
  const allow=new Set(['d1']);
  assert.equal(projectDetection({uuid:'threat',context:{deviceUuid:'d2'}},allow),null);
  const projected=projectDetection({uuid:'threat',context:{deviceUuid:'d1'},displayName:'Risk',
    objectUrl:'https://sensitive.example',severityLevel:'HIGH'},allow);
  assert.equal(projected.name,'Risk');
  assert.equal(JSON.stringify(projected).includes('sensitive.example'),false);
});
