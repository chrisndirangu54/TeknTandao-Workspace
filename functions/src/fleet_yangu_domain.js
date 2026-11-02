import {randomBytes,createCipheriv,createDecipheriv} from 'node:crypto';

export const safeId=value=>{
  if(typeof value!=='string'||!/^[A-Za-z0-9_-]{1,100}$/.test(value))
    throw new Error('Invalid identifier');
  return value;
};
export function encryptBridgeToken(token,keyBase64) {
  if(typeof token!=='string'||!/^fyw_[A-Za-z0-9_-]{43}$/.test(token))
    throw new Error('Fleet Yangu integration token is invalid');
  const key=Buffer.from(keyBase64||'','base64');
  if(key.length!==32)throw new Error('Fleet Yangu encryption secret must be 32 bytes in base64');
  const iv=randomBytes(12);
  const encryptor=createCipheriv('aes-256-gcm',key,iv);
  const cipher=Buffer.concat([encryptor.update(token,'utf8'),encryptor.final()]);
  return {version:1,iv:iv.toString('base64'),ciphertext:cipher.toString('base64'),
    tag:encryptor.getAuthTag().toString('base64')};
}
export function decryptBridgeToken(blob,keyBase64) {
  if(!blob||blob.version!==1)throw new Error('Unsupported Fleet Yangu key version');
  const key=Buffer.from(keyBase64||'','base64');
  if(key.length!==32)throw new Error('Fleet Yangu encryption secret is not configured');
  const decoder=createDecipheriv('aes-256-gcm',key,Buffer.from(blob.iv,'base64'));
  decoder.setAuthTag(Buffer.from(blob.tag,'base64'));
  return Buffer.concat([decoder.update(Buffer.from(blob.ciphertext,'base64')),decoder.final()]).toString('utf8');
}
export function fleetVehicleStatus(input,bindings=[]) {
  if(!input||!Array.isArray(input.vehicles))throw new Error('Invalid Fleet Yangu response');
  const index=new Map(bindings.map(b=>[b.fleetVehicleId,b.workspaceVehicleId]));
  const safeNum=(value,min,max)=>typeof value==='number'&&Number.isFinite(value)
    &&value>=min&&value<=max?value:null;
  return input.vehicles.slice(0,100).filter(v=>v&&/^[A-Za-z0-9_-]{1,100}$/.test(v.id))
    .map(v=>({
      fleetVehicleId:v.id,workspaceVehicleId:index.get(v.id)||null,
      registration:String(v.registration||'').slice(0,30),
      status:String(v.status||'unknown').slice(0,40),
      healthScore:safeNum(v.healthScore,0,100),
      fleetRiskScore:safeNum(v.fleetRiskScore,0,100),
      lastTelemetryAt:typeof v.lastTelemetryAt==='string'?
        v.lastTelemetryAt.slice(0,40):null,
      telemetry:{coolantTempC:safeNum(v.telemetry?.coolantTempC,-60,180),
        speedKph:safeNum(v.telemetry?.speedKph,0,350),
        fuelPercent:safeNum(v.telemetry?.fuelPercent,0,100)}}
    ));
}
export function validateFleetReadiness(vehicle,alerts=[]) {
  if(!vehicle)throw new Error('Fleet Yangu vehicle missing');
  if(vehicle.healthScore!==null&&vehicle.healthScore<50)
    throw new Error('Vehicle health is below the dispatch threshold');
  if(vehicle.fleetRiskScore!==null&&vehicle.fleetRiskScore>=75)
    throw new Error('Fleet Yangu risk threshold exceeded');
  if(alerts.some(a=>a.vehicleId===vehicle.fleetVehicleId&&
       a.status==='open'&&a.severity==='critical'))
    throw new Error('Critical open Fleet Yangu safety alert');
  return {readyForReview:true,automaticallyDispatched:false};
}
