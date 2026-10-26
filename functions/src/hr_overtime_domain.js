export function proposeOvertime(timesheet,shift,minutes,reason){
 if(timesheet?.status!=='approved'||timesheet.payrollPosted!==false)throw new Error('Approved unposted timesheet required');
 if(shift?.status!=='scheduled'||shift.employeeId!==timesheet.employeeId||timesheet.shiftId!==shift.id)
  throw new Error('Timesheet shift mismatch');
 const scheduled=Math.round((Date.parse(shift.endAt)-Date.parse(shift.startAt))/60000);
 if(!Number.isSafeInteger(scheduled)||scheduled<1)throw new Error('Invalid scheduled shift');
 const maximum=Math.max(0,timesheet.netMinutes-scheduled);
 if(!Number.isSafeInteger(minutes)||minutes<1||minutes>maximum)
  throw new Error('Overtime exceeds recorded time beyond scheduled hours');
 if(typeof reason!=='string'||!reason.trim()||reason.length>1000)throw new Error('Overtime justification required');
 return {timesheetId:timesheet.shiftId,employeeId:timesheet.employeeId,minutes,
  reason:reason.trim(),status:'pending',payrollPosted:false};
}
export function decideOvertime(request,status,note){
 if(request?.status!=='pending'||!['approved','rejected'].includes(status))
  throw new Error('Overtime decision not permitted');
 if(typeof note!=='string'||!note.trim()||note.length>1000)throw new Error('Decision note required');
 return {status,decisionNote:note.trim()};
}
