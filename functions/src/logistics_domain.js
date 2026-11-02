// Pure, deterministic logistics domain rules. No provider data is fabricated.
export const carrierDirectory = Object.freeze([
  {id:'dhl',name:'DHL Group',mode:'api_ready',capabilities:['tracking','international','express'],credential:'DHL_UNIFIED_API_KEY'},
  {id:'fedex',name:'FedEx',mode:'requires_partner_credentials',capabilities:['tracking','express','international']},
  {id:'ups',name:'UPS',mode:'requires_partner_credentials',capabilities:['tracking','express','international']},
  {id:'aramex',name:'Aramex',mode:'requires_partner_credentials',capabilities:['tracking','cross_border']},
  {id:'g4s',name:'G4S Kenya',mode:'requires_partner_agreement',capabilities:['local_delivery']},
  {id:'fargo',name:'Fargo Courier',mode:'requires_partner_agreement',capabilities:['local_delivery']},
  {id:'other',name:'Independent 3PL / local carrier',mode:'manual',capabilities:['road','last_mile']}
]);
const statuses=['draft','booked','picked_up','in_transit','at_hub','customs_hold','exception','out_for_delivery','delivered','cancelled'];
const next={
  draft:['booked','cancelled'],booked:['picked_up','in_transit','cancelled'],
  picked_up:['in_transit','exception'],in_transit:['at_hub','customs_hold','exception','out_for_delivery','delivered'],
  at_hub:['in_transit','customs_hold','exception','out_for_delivery'],
  customs_hold:['in_transit','exception'],exception:['in_transit','customs_hold','cancelled'],
  out_for_delivery:['delivered','exception'],delivered:[],cancelled:[]
};
function text(value,label,max=160){
  if(typeof value!=='string'||!value.trim()||value.length>max)throw new Error('Invalid '+label);
  return value.trim();
}
function optional(value,label,max=160){
  return value==null||value===''?'':text(value,label,max);
}
function nonnegative(v,label,max=100000000){
  if(typeof v!=='number'||!Number.isFinite(v)||v<0||v>max)throw new Error('Invalid '+label);
  return v;
}
export function normalizeShipment(input){
  if(!input||typeof input!=='object'||Array.isArray(input))throw new Error('Invalid shipment');
  const mode=input.mode||'road';
  if(!['road','rail','air','ocean','multimodal','courier'].includes(mode))throw new Error('Invalid transport mode');
  const currency=input.currency||'KES';
  if(!['KES','USD','EUR','GBP','UGX','TZS','RWF'].includes(currency))throw new Error('Unsupported currency');
  return {
    reference:text(input.reference,'shipment reference',80),
    customer: text(input.customer,'customer'),
    origin:text(input.origin,'origin'),
    destination:text(input.destination,'destination'),
    description:optional(input.description,'cargo description',600),
    carrierId:optional(input.carrierId,'carrier identifier',100),
    trackingNumber:optional(input.trackingNumber,'tracking number',100),
    vehicleId:optional(input.vehicleId,'vehicle identifier',100),
    mode, currency,
    weightKg:nonnegative(input.weightKg??0,'cargo weight',100000000),
    declaredValueMinor:nonnegative(input.declaredValueMinor??0,'declared value',1000000000000),
    estimatedCostMinor:nonnegative(input.estimatedCostMinor??0,'cost estimate',1000000000000),
    dueAt:optional(input.dueAt,'delivery date',50),
    notes:optional(input.notes,'notes',1000),
    status:'draft'
  };
}
export function normalizeCarrier(input){
  if(!input||typeof input!=='object'||Array.isArray(input))throw new Error('Invalid carrier');
  const providerId=input.providerId||'other';
  if(!carrierDirectory.some(x=>x.id===providerId))throw new Error('Unsupported provider');
  const currency=input.currency||'KES';
  if(!['KES','USD','EUR','GBP','UGX','TZS','RWF'].includes(currency))throw new Error('Unsupported currency');
  return {
    providerId,
    company:text(input.company,'company name',160),
    contact:optional(input.contact,'carrier contact',160),
    serviceRegion:optional(input.serviceRegion,'coverage region',120),
    connectionStatus:'manual', // only server-side verified connections may become live
    tariffMinor:nonnegative(input.tariffMinor??0,'indicative tariff',1000000000000),
    tariffPerKgMinor:nonnegative(input.tariffPerKgMinor??0,'weight tariff',1000000000000),
    currency
  };
}
export function transitionShipment(current,status){
  if(!statuses.includes(status))throw new Error('Unknown shipment status');
  if(!next[current]?.includes(status))throw new Error('Invalid shipment state transition');
  return status;
}
export function normalizeMilestone(input){
  if(!input||typeof input!=='object'||Array.isArray(input))throw new Error('Invalid tracking event');
  return {status:text(input.status,'status',30),location:optional(input.location,'location',160),
    note:optional(input.note,'event note',500),source:'staff'};
}
export function tariffComparison(shipment,carriers){
  if(!Array.isArray(carriers))throw new Error('Invalid carrier rates');
  return carriers.filter(c=>c&&c.currency===shipment.currency&&c.tariffMinor>0)
    .map(c=>({carrierId:c.id,company:c.company,currency:c.currency,
      estimatedCostMinor:Math.round(c.tariffMinor+((c.tariffPerKgMinor||0)*shipment.weightKg)),
      source:'operator_entered_tariff',isLiveQuote:false}))
    .sort((a,b)=>a.estimatedCostMinor-b.estimatedCostMinor);
}
// Explainable dispatch *proposal* only; without road network travel-time matrices it
// cannot represent optimal or traffic-aware routing. Human dispatcher approves.
export function dispatchProposal(shipments,vehicles){
  if(!Array.isArray(shipments)||!Array.isArray(vehicles))throw new Error('Invalid dispatch data');
  const active=vehicles.filter(v=>v&&v.available===true&&Number.isFinite(v.capacityKg)&&v.capacityKg>0)
    .map(v=>({id:v.id,capacityKg:v.capacityKg,remainingKg:v.capacityKg,assigned:[]}));
  const unassigned=[];
  for(const s of shipments.filter(x=>x&&['draft','booked'].includes(x.status))
    .sort((a,b)=>Number(b.weightKg||0)-Number(a.weightKg||0))){
    const weight=nonnegative(s.weightKg??0,'shipment weight');
    const fit=active.filter(v=>v.remainingKg>=weight).sort((a,b)=>a.remainingKg-b.remainingKg)[0];
    if(!fit){unassigned.push({shipmentId:s.id,reason:'No vehicle with remaining capacity'});continue;}
    fit.remainingKg-=weight;fit.assigned.push(s.id);
  }
  return {algorithm:'capacity_first_fit_decreasing_space',optimal:false,
    assignments:active.filter(v=>v.assigned.length).map(v=>({vehicleId:v.id,shipmentIds:v.assigned,loadKg:v.capacityKg-v.remainingKg})),
    unassigned};
}
export function trackingFromDhl(payload){
  const record=Array.isArray(payload?.shipments)?payload.shipments[0]:null;
  if(!record)return {found:false,provider:'dhl'};
  const events=Array.isArray(record.events)?record.events.slice(0,30).map(e=>({
    time:String(e.timestamp||''),description:String(e.description||'').slice(0,250),
    location:String(e.location?.address?.addressLocality||'').slice(0,120)
  })):[];
  return {found:true,provider:'dhl',trackingNumber:String(record.id||''),status:String(record.status?.statusCode||'unknown'),
    statusDescription:String(record.status?.description||'').slice(0,250),events};
}
