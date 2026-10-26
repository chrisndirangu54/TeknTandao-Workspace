import {createHash} from 'node:crypto';
export function payrollTimeSnapshot(register){
 if(!register||!/^\d{4}-(0[1-9]|1[0-2])$/.test(register.period)||!Array.isArray(register.rows))throw new Error('Invalid time register');
 const rows=register.rows.map(r=>({timesheetId:r.timesheetId,regularMinutes:r.regularMinutes,approvedOvertimeMinutes:r.approvedOvertimeMinutes,netMinutes:r.regularAndOvertimeMinutes})).sort((a,b)=>a.timesheetId.localeCompare(b.timesheetId));
 if(rows.some(r=>!r.timesheetId||![r.regularMinutes,r.approvedOvertimeMinutes,r.netMinutes].every(v=>Number.isSafeInteger(v)&&v>=0)||r.regularMinutes+r.approvedOvertimeMinutes!==r.netMinutes))throw new Error('Invalid time allocation');
 const canonical=JSON.stringify({period:register.period,rows});
 return {period:register.period,rows,totalNetMinutes:rows.reduce((n,r)=>n+r.netMinutes,0),
  approvedOvertimeMinutes:rows.reduce((n,r)=>n+r.approvedOvertimeMinutes,0),
  digest:createHash('sha256').update(canonical).digest('hex'),status:'locked',payrollPosted:false};
}
