export function draftTimesheet(shift,reconciliation,breakMinutes,reason){
 if(shift?.status!=='scheduled')throw new Error('Scheduled shift required');
 if(!reconciliation||reconciliation.workedMinutes==null||!reconciliation.punchId)
  throw new Error('Complete attendance evidence required');
 if(!Number.isSafeInteger(breakMinutes)||breakMinutes<0||breakMinutes>reconciliation.workedMinutes)
  throw new Error('Invalid unpaid break');
 if(typeof reason!=='string'||!reason.trim()||reason.length>1000)throw new Error('Review explanation required');
 const netMinutes=reconciliation.workedMinutes-breakMinutes;
 if(netMinutes<0||netMinutes>1440)throw new Error('Invalid worked minutes');
 return {status:'pending',shiftId:shift.id,employeeId:shift.employeeId,
  punchId:reconciliation.punchId,grossMinutes:reconciliation.workedMinutes,
  unpaidBreakMinutes:breakMinutes,netMinutes,reason:reason.trim(),payrollPosted:false};
}
export function decideTimesheet(sheet,decision,note){
 if(sheet?.status!=='pending'||!['approved','rejected'].includes(decision))
  throw new Error('Timesheet cannot be decided');
 if(typeof note!=='string'||!note.trim()||note.length>1000)
  throw new Error('Supervisor decision note required');
 return {status:decision,decisionNote:note.trim()};
}
