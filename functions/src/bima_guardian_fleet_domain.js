// Insurance records and Bima Guardian quote payloads are strictly separated
// from fleet telemetry. Returned premiums are estimates, never proof of cover.
export function bimaFleetQuoteInput(d) {
  if(!d||!['fleet','commercial'].includes(d.subtype))
    throw new Error('Motor fleet or commercial cover required');
  const sumInsured=d.sumInsured;
  if(!Number.isSafeInteger(sumInsured)||sumInsured<10000||sumInsured>1000000000)
    throw new Error('Positive integer KES sum insured required');
  if(typeof d.vehicleId!=='string'||!/^[A-Za-z0-9_-]{1,100}$/.test(d.vehicleId))
    throw new Error('Registered Workspace vehicle required');
  return {vehicleId:d.vehicleId,product:'motor',subtype:d.subtype,
    sumInsured,audience:'fleet_logistics'};
}
export function bimaNormalizeQuote(raw) {
  if(!raw||typeof raw!=='object'||!Array.isArray(raw.options))
    throw new Error('Unexpected Bima Guardian quotation response');
  const source=raw.source==='uploaded'?'uploaded_rate_card':'demo';
  const options=raw.options.slice(0,12).filter(x=>x&&
    typeof x.insurerName==='string'&&x.insurerName.length>0&&
    typeof x.premium==='number'&&Number.isFinite(x.premium)&&x.premium>=0)
    .map(x=>({insurerName:x.insurerName.slice(0,100),
      insurerId:typeof x.insurerId==='string'?x.insurerId.slice(0,100):null,
      estimatedPremiumKes:x.premium}));
  return {quoteReference:typeof raw.id==='string'?raw.id.slice(0,100):null,
    provider:'bima_guardian',status:'indicative_not_bound',source,currency:'KES',
    options,insurerConfirmed:false,
    notice:'Indicative prices only. Bima Guardian calculator does not confirm cover, terms, insurer authority or payment.'};
}
const day=d=>{
  if(typeof d!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(d))throw new Error('YYYY-MM-DD date required');
  const x=new Date(d+'T00:00:00.000Z');
  if(!Number.isFinite(x.getTime())||x.toISOString().slice(0,10)!==d)
    throw new Error('Invalid calendar date');
  return d;
};
export function bimaManualPolicy(d) {
  if(!d||typeof d.vehicleId!=='string'||!/^[A-Za-z0-9_-]{1,100}$/.test(d.vehicleId))
    throw new Error('Registered vehicle required');
  for(const name of ['insurer','policyNumber'])
    if(typeof d[name]!=='string'||!d[name].trim()||d[name].length>120)
      throw new Error('Insurer and policy number required');
  if(!['fleet','commercial'].includes(d.subtype))throw new Error('Unsupported cover');
  const effectiveFrom=day(d.effectiveFrom),expiresOn=day(d.expiresOn);
  if(expiresOn<=effectiveFrom)throw new Error('Expiry must follow policy inception');
  return {vehicleId:d.vehicleId,insurer:d.insurer.trim(),
    policyNumber:d.policyNumber.trim(),subtype:d.subtype,
    effectiveFrom,expiresOn,source:'manual_entry',
    verificationStatus:'unverified',coverageConfirmed:false};
}
export function bimaRenewal(record,now=new Date()) {
  const expiry=Date.parse(String(record.expiresOn||'')+'T00:00:00Z');
  if(!Number.isFinite(expiry))return {daysToExpiry:null,notice:'Invalid expiry recorded'};
  const today=Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),now.getUTCDate());
  const daysToExpiry=Math.round((expiry-today)/86400000);
  return {daysToExpiry,notice:daysToExpiry<0?'Recorded expiry passed':
    daysToExpiry<=30?'Renewal review suggested':'Recorded renewal date',
    coverageConfirmed:false};
}
