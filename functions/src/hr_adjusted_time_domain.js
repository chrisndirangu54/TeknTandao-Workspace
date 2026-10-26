import {createHash} from 'node:crypto';
export function adjustedTimeRegister(lock,corrections){
 if(!lock||lock.status!=='locked'||typeof lock.digest!=='string'||!Array.isArray(lock.rows))throw new Error('Locked original register required');
 if(!Array.isArray(corrections)||corrections.length>500)throw new Error('Too many correction records');
 const rows=lock.rows.map(r=>({...r}));
 const byId=new Map(rows.map(r=>[r.timesheetId,r]));
 if(byId.size!==rows.length)throw new Error('Duplicate locked timesheet');
 const applied=[];
 for(const c of corrections.filter(c=>c.status==='approved').sort((a,b)=>a.id.localeCompare(b.id))){
  if(c.originalDigest!==lock.digest)throw new Error('Correction snapshot mismatch');
  if(applied.some(a=>a.timesheetId===c.timesheetId))throw new Error('Competing approved corrections for timesheet');
  const row=byId.get(c.timesheetId);
  if(!row)throw new Error('Correction references missing timesheet');
  if(![c.regularMinutes,c.approvedOvertimeMinutes].every(x=>Number.isSafeInteger(x)&&x>=0&&x<=1440)||c.regularMinutes+c.approvedOvertimeMinutes>1440)
   throw new Error('Invalid correction hours');
  row.regularMinutes=c.regularMinutes;
  row.approvedOvertimeMinutes=c.approvedOvertimeMinutes;
  row.netMinutes=c.regularMinutes+c.approvedOvertimeMinutes;
  applied.push({correctionId:c.id,timesheetId:c.timesheetId});
 }
 const canonical=JSON.stringify({originalDigest:lock.digest,rows,applied});
 return {period:lock.period,originalDigest:lock.digest,version:applied.length?'adjusted':'original',
  rows,applied,totalNetMinutes:rows.reduce((sum,r)=>sum+r.netMinutes,0),
  approvedOvertimeMinutes:rows.reduce((sum,r)=>sum+r.approvedOvertimeMinutes,0),
  digest:createHash('sha256').update(canonical).digest('hex'),payrollPosted:false};
}
