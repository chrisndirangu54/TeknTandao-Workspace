import {identifier} from './domain.js';
const iso=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(value)&&!Number.isNaN(Date.parse(value))&&new Date(value).toISOString().replace('.000','')===value;
export function validateShift(input){
 const employeeId=identifier(input?.employeeId);
 const startAt=input?.startAt,endAt=input?.endAt;
 if(!iso(startAt)||!iso(endAt)||startAt>=endAt)throw new Error('Invalid UTC shift interval');
 const duration=(Date.parse(endAt)-Date.parse(startAt))/60000;
 if(duration>24*60||duration<15)throw new Error('Shift must last 15 minutes to 24 hours');
 const title=input?.title??'Assigned shift';
 if(typeof title!=='string'||!title.trim()||title.length>120)throw new Error('Invalid shift title');
 return {employeeId,startAt,endAt,title:title.trim(),status:'scheduled',durationMinutes:duration};
}
export function shiftConflicts(candidate,shifts,leaves){
 if(shifts.some(s=>s.status!=='cancelled'&&candidate.startAt<s.endAt&&candidate.endAt>s.startAt))
  throw new Error('Shift overlaps an existing assignment');
 if(leaves.some(l=>{
  if(l.status!=='approved')return false;
  const from=l.startDate+'T00:00:00Z';
  const to=new Date(Date.parse(l.endDate+'T00:00:00Z')+86400000).toISOString();
  return candidate.startAt<to&&candidate.endAt>from;
 }))throw new Error('Shift overlaps approved leave');
}
export function changeShiftStatus(shift,status){
 if(shift?.status!=='scheduled'||status!=='cancelled')throw new Error('Only scheduled shifts may be cancelled');
 return {status:'cancelled'};
}
