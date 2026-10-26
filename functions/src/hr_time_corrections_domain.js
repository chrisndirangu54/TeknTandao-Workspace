export function proposeHrTimeCorrection(lock, input) {
 if(!lock || lock.status!=='locked' || !Array.isArray(lock.rows))throw new Error('Locked time register required');
 const row=lock.rows.find(x=>x.timesheetId===input?.timesheetId);
 if(!row)throw new Error('Timesheet absent from locked register');
 const regularMinutes=input.regularMinutes, approvedOvertimeMinutes=input.approvedOvertimeMinutes;
 if(![regularMinutes,approvedOvertimeMinutes].every(x=>Number.isSafeInteger(x)&&x>=0&&x<=1440))
  throw new Error('Invalid correction minutes');
 if(regularMinutes+approvedOvertimeMinutes>1440)throw new Error('Correction exceeds daily time bounds');
 if(regularMinutes===row.regularMinutes&&approvedOvertimeMinutes===row.approvedOvertimeMinutes)
  throw new Error('Correction must change recorded time');
 if(typeof input.reason!=='string'||!input.reason.trim()||input.reason.length>1000)
  throw new Error('Correction justification required');
 return {timesheetId:input.timesheetId,regularMinutes,approvedOvertimeMinutes,
   reason:input.reason.trim(),originalDigest:lock.digest,status:'pending',payrollPosted:false};
}
export function decideHrTimeCorrection(current,action,note){
 if(current?.status!=='pending'||!['approved','rejected'].includes(action))
  throw new Error('Invalid correction decision');
 if(typeof note!=='string'||!note.trim()||note.length>1000)
  throw new Error('Correction decision note required');
 return {status:action,decisionNote:note.trim()};
}
