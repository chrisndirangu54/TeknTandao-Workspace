export function reconcileShiftPunches(shift,punches,{graceMinutes=5}={}){
 if(!Number.isInteger(graceMinutes)||graceMinutes<0||graceMinutes>120)throw new Error('Invalid grace period');
 const start=Date.parse(shift?.startAt),end=Date.parse(shift?.endAt);
 if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start)throw new Error('Invalid shift');
 const completed=(punches||[]).filter(p=>p.checkIn&&p.checkOut)
  .map(p=>({start:Date.parse(p.checkIn),end:Date.parse(p.checkOut),id:p.id}))
  .filter(p=>Number.isFinite(p.start)&&Number.isFinite(p.end)&&p.end>p.start);
 // Attendance is stored in calendar-day punch records. Do not stitch multiple
 // punches or invent missing overnight check-outs.
 const selected=completed.find(p=>p.start<=end&&p.end>=start);
 if(!selected)return {status:'missing_or_incomplete',verified:false,scheduledMinutes:Math.round((end-start)/60000),
  workedMinutes:null,lateMinutes:null,earlyDepartureMinutes:null};
 const workedMinutes=Math.round((selected.end-selected.start)/60000);
 const lateMinutes=Math.max(0,Math.ceil((selected.start-start)/60000)-graceMinutes);
 const earlyDepartureMinutes=Math.max(0,Math.ceil((end-selected.end)/60000)-graceMinutes);
 return {status:lateMinutes||earlyDepartureMinutes?'exception':'matched',
  verified:false,scheduledMinutes:Math.round((end-start)/60000),workedMinutes,
  lateMinutes,earlyDepartureMinutes,punchId:selected.id,
  note:'Raw self-recorded clock events only; requires independent HR verification before payroll.'};
}
