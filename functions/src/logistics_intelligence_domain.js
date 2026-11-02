// Fail-closed validation shared by routing and GPS integrations.
const isObject = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const finite = v => typeof v === 'number' && Number.isFinite(v);
export function latLon(input, label='coordinate') {
  if (!isObject(input) || !finite(input.lat) || !finite(input.lon) ||
      Math.abs(input.lat)>90 || Math.abs(input.lon)>180)
    throw new Error('Valid '+label+' latitude and longitude required');
  return {lat:input.lat,lon:input.lon};
}
export function routePlanningInput(shipments,vehicles,depot) {
  const origin=latLon(depot,'depot');
  if(!Array.isArray(shipments)||!Array.isArray(vehicles))throw new Error('Invalid planning records');
  const readyVehicles=vehicles.filter(v=>v?.available===true&&finite(v.capacityKg)&&v.capacityKg>0)
    .slice(0,12).map(v=>({id:v.id,capacityGrams:Math.round(v.capacityKg*1000)}));
  if(!readyVehicles.length)throw new Error('No available vehicles with valid capacity');
  const exclusions=[];
  const ready=[];
  for(const s of shipments.slice(0,150)) {
    if(!s||!['draft','booked'].includes(s.status))continue;
    if(!finite(s.weightKg)||s.weightKg<=0) {
      exclusions.push({shipmentId:s.id,reason:'positive_weight_required'});continue;
    }
    if(!finite(s.destinationLat)||!finite(s.destinationLon)) {
      exclusions.push({shipmentId:s.id,reason:'destination_coordinates_required'});continue;
    }
    let location;
    try { location=latLon({lat:s.destinationLat,lon:s.destinationLon},'destination'); }
    catch { exclusions.push({shipmentId:s.id,reason:'invalid_coordinates'});continue; }
    const demandGrams=Math.round(s.weightKg*1000);
    if(demandGrams<=0 || !readyVehicles.some(v=>v.capacityGrams>=demandGrams)) {
      exclusions.push({shipmentId:s.id,reason:'capacity_unavailable'});continue;
    }
    const start=s.deliveryWindowStartMin??0, end=s.deliveryWindowEndMin??1440;
    if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<0||end>1440||end<=start) {
      exclusions.push({shipmentId:s.id,reason:'invalid_delivery_window'});continue;
    }
    ready.push({id:s.id,...location,demandGrams,timeWindow:[start,end],serviceMinutes:10});
    if(ready.length>=30)break;
  }
  if(!ready.length)throw new Error('No eligible, geocoded shipments for route optimization');
  return {model:'capacitated_vehicle_routing_time_windows',depot:origin,
    vehicles:readyVehicles,stops:ready,excluded:exclusions};
}
export function assertRoutePlanResponse(input,result) {
  if(!isObject(result)||!Array.isArray(result.routes)||!Array.isArray(result.unassigned))
    throw new Error('Invalid optimizer response');
  const stops=new Set(input.stops.map(s=>s.id));
  const vehicles=new Set(input.vehicles.map(v=>v.id));
  const assigned=new Set();
  for(const route of result.routes) {
    if(!vehicles.has(route.vehicleId)||!Array.isArray(route.stops))
      throw new Error('Unknown vehicle or invalid route');
    let load=0;
    const cap=input.vehicles.find(v=>v.id===route.vehicleId).capacityGrams;
    for(const stop of route.stops) {
      if(!stops.has(stop.shipmentId)||assigned.has(stop.shipmentId)||
          !finite(stop.etaMinutes)||stop.etaMinutes<0)
        throw new Error('Invalid or duplicate optimizer stop');
      load+=input.stops.find(x=>x.id===stop.shipmentId).demandGrams;
      assigned.add(stop.shipmentId);
    }
    if(load>cap)throw new Error('Optimizer exceeded vehicle payload');
  }
  for(const item of result.unassigned) {
    if(!stops.has(item.shipmentId)||assigned.has(item.shipmentId))
      throw new Error('Invalid unassigned shipment');
    assigned.add(item.shipmentId);
  }
  if(assigned.size!==stops.size)throw new Error('Optimizer omitted shipment(s)');
  return {routes:result.routes,unassigned:result.unassigned,diagnostics:{
    solver:'OR-Tools',routing:'Valhalla road matrix',optimal:false,
    solverStatus:String(result.solverStatus||'unknown').slice(0,80),
    matrixSource:'configured Valhalla instance',excluded:input.excluded}};
}
export function normalizeTraccarPosition(raw,expectedDeviceId,now=Date.now()) {
  if(!isObject(raw)||!Number.isSafeInteger(expectedDeviceId)||
      raw.deviceId!==expectedDeviceId)throw new Error('Wrong GPS device');
  const point=latLon({lat:raw.latitude,lon:raw.longitude},'GPS fix');
  const fixAt=Date.parse(raw.fixTime||raw.deviceTime||'');
  if(!Number.isFinite(fixAt)||fixAt>now+120000)throw new Error('GPS fix time invalid');
  const ageSeconds=Math.round((now-fixAt)/1000);
  if(ageSeconds>86400)throw new Error('GPS fix older than 24 hours');
  const knots=raw.speed;
  return {...point,fixAt:new Date(fixAt).toISOString(),ageSeconds,
    stale:ageSeconds>600,valid:raw.valid===true,
    speedKmh:finite(knots)&&knots>=0&&knots<400
      ?Math.round(knots*1.852*10)/10:null,
    source:'Traccar',liveStream:false};
}
