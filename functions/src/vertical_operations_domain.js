export function validateAppointment({startAt,endAt,resourceId},existing=[]){
 const start=Date.parse(startAt),end=Date.parse(endAt);
 if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start||end-start>8*3600000)
  throw new Error('Invalid appointment interval');
 if(typeof resourceId!=='string'||!resourceId.trim())throw new Error('Resource required');
 for(const booking of existing){
  if(booking.resourceId!==resourceId||booking.status==='cancelled')continue;
  if(start<Date.parse(booking.endAt)&&end>Date.parse(booking.startAt))
   throw new Error('Appointment resource conflict');
 }
 return {startAt:new Date(start).toISOString(),endAt:new Date(end).toISOString(),resourceId};
}
export function validateAttendance({studentId,date,status}){
 if(typeof studentId!=='string'||!studentId.trim())throw new Error('Student required');
 if(typeof date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(date)||
  !Number.isFinite(Date.parse(date+'T00:00:00Z'))||
  new Date(date+'T00:00:00Z').toISOString().slice(0,10)!==date)throw new Error('Invalid attendance date');
 if(!['present','absent','late','excused'].includes(status))throw new Error('Invalid attendance status');
 return {studentId,date,status};
}
