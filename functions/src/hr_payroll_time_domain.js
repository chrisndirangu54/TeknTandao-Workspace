export function payrollTimeRegister(period,timesheets,overtime){
 if(typeof period!=='string'||!/^\d{4}-(0[1-9]|1[0-2])$/.test(period))throw new Error('Invalid payroll period');
 if(!Array.isArray(timesheets)||!Array.isArray(overtime)||timesheets.length>500||overtime.length>500)
  throw new Error('Payroll register limit exceeded');
 const items=new Map();
 for(const entry of timesheets){
  if(entry.status!=='approved')continue;
  if(entry.period!==period)continue;
  if(!entry.id||items.has(entry.id))throw new Error('Duplicate approved timesheet');
  if(!Number.isSafeInteger(entry.netMinutes)||entry.netMinutes<0||entry.netMinutes>1440)
   throw new Error('Invalid approved minutes');
  items.set(entry.id,{timesheetId:entry.id,regularAndOvertimeMinutes:entry.netMinutes,approvedOvertimeMinutes:0});
 }
 const seen=new Set();
 for(const entry of overtime){
  if(entry.status!=='approved'||entry.period!==period)continue;
  if(!entry.id||seen.has(entry.id))throw new Error('Duplicate approved overtime');
  seen.add(entry.id);
  const row=items.get(entry.timesheetId);
  if(!row)throw new Error('Overtime not linked to approved timesheet');
  if(!Number.isSafeInteger(entry.minutes)||entry.minutes<1||entry.minutes>row.regularAndOvertimeMinutes-row.approvedOvertimeMinutes)
   throw new Error('Invalid overtime minutes');
  row.approvedOvertimeMinutes+=entry.minutes;
 }
 const rows=[...items.values()].map(x=>({...x,regularMinutes:x.regularAndOvertimeMinutes-x.approvedOvertimeMinutes}));
 return {period,rows,totalNetMinutes:rows.reduce((n,x)=>n+x.regularAndOvertimeMinutes,0),
  approvedOvertimeMinutes:rows.reduce((n,x)=>n+x.approvedOvertimeMinutes,0),
  payrollPosted:false,verifiedPayroll:false};
}
