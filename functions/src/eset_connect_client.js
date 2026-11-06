// ESET Connect v1 read-only integration client; all URLs are fixed, never user-supplied.
// Uses a distinct ESET Connect API account, separate from MSP/PROTECT Hub credentials.
const allowedRegions = new Set(['eu','de','us','ca','jpn']);
export function validRegion(region) {
  if (!allowedRegions.has(region)) throw new Error('Unsupported ESET region');
  return region;
}
export const esetEndpoints = region => {
  validRegion(region);
  return {
    identity: `https://${region}.business-account.iam.eset.systems/oauth/token`,
    devices: `https://${region}.device-management.eset.systems/v1/devices`,
    detections: `https://${region}.incident-management.eset.systems/v1/detections`
  };
};
async function checkedResponse(response) {
  if (!response.ok) {
    const err = new Error(`ESET provider HTTP ${response.status}`);
    err.status = response.status;
    throw err;
  }
  if (response.status === 202) throw new Error('ESET response pending; retry later');
  return response.json();
}
export async function esetConnectToken({region, username, password, fetchFn = fetch}) {
  if (!username || !password) throw new Error('Missing ESET Connect API credentials');
  const url = esetEndpoints(region).identity;
  const params = new URLSearchParams({grant_type:'password',username,password});
  const response = await fetchFn(url, {
    method:'POST', redirect:'error', signal:AbortSignal.timeout(15000),
    headers:{'content-type':'application/x-www-form-urlencoded','accept':'application/json'},
    body:params.toString()
  });
  const token = await checkedResponse(response);
  if (typeof token.access_token !== 'string' || !token.access_token)
    throw new Error('Invalid ESET Connect token response');
  return token.access_token;
}
export async function esetConnectPage({region,kind,token,pageToken='',pageSize=100,fetchFn=fetch,startTime}){
  if (!['devices','detections'].includes(kind)) throw new Error('Unsupported collection');
  if (!Number.isInteger(pageSize)||pageSize<1||pageSize>100) throw new Error('Page limit exceeded');
  const endpoint = esetEndpoints(region)[kind];
  const url = new URL(endpoint);
  url.searchParams.set('pageSize',String(pageSize));
  if (pageToken) url.searchParams.set('pageToken',pageToken);
  if (kind === 'detections' && startTime) url.searchParams.set('startTime',startTime);
  const response = await fetchFn(url.toString(),{
    method:'GET',redirect:'error',signal:AbortSignal.timeout(15000),
    headers:{authorization:`Bearer ${token}`,accept:'application/json'}
  });
  const result = await checkedResponse(response);
  const entries = result[kind];
  if (!Array.isArray(entries)) throw new Error('Malformed ESET page');
  return {entries,nextPageToken:typeof result.nextPageToken==='string'?result.nextPageToken:''};
}
export async function collectEsetPages({region,kind,token,fetchFn=fetch,startTime,maxPages=5}){
  const out=[];let cursor='';const seen=new Set();let complete=false;
  for(let i=0;i<maxPages;i++){
    const page=await esetConnectPage({region,kind,token,fetchFn,pageToken:cursor,startTime});
    out.push(...page.entries);
    if (!page.nextPageToken) {complete=true;break;}
    if (seen.has(page.nextPageToken)) throw new Error('Cyclic ESET pagination');
    seen.add(page.nextPageToken);cursor=page.nextPageToken;
  }
  return {entries:out,complete,nextPageToken:complete?'':cursor};
}
export function projectDevice(device,ownerUuid){
  if (device?.ownerUuid !== ownerUuid || !device.uuid) return null;
  return {id:String(device.uuid).slice(0,128),name:String(device.displayName||device.systemHostname||'Managed endpoint').slice(0,160),
    protection:String(device.functionalityStatus||'UNKNOWN').slice(0,80),
    ownerUuid,kind:'device'};
}
export function projectDetection(detection,allowedDeviceIds){
  if (!allowedDeviceIds.has(detection?.context?.deviceUuid) || !detection.uuid) return null;
  return {id:String(detection.uuid).slice(0,128),deviceId:detection.context.deviceUuid,
    name:String(detection.displayName||detection.typeName||'Detection').slice(0,160),
    severity:String(detection.severityLevel||'UNKNOWN').slice(0,80),
    occurredAt:typeof detection.occurTime==='string'?detection.occurTime:null,kind:'detection'};
}
