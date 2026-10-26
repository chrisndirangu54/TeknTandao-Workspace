import {identifier} from './domain.js';
function date(value){
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(Date.parse(value+'T00:00:00Z'))||new Date(value+'T00:00:00Z').toISOString().slice(0,10)!==value)
  throw new Error('Invalid leave date');
 return value;
}
export function leaveRequest({employeeId,startDate,endDate,leaveType,reason}){
 const start=date(startDate),end=date(endDate);
 if(end<start)throw new Error('Leave end before start');
 const days=(Date.parse(end+'T00:00:00Z')-Date.parse(start+'T00:00:00Z'))/86400000+1;
 if(days>366)throw new Error('Leave request exceeds allowed duration');
 if(!['annual','sick','parental','unpaid','other'].includes(leaveType))throw new Error('Invalid leave type');
 if(typeof reason!=='string'||!reason.trim()||reason.length>1000)throw new Error('Reason required');
 return {employeeId:identifier(employeeId),startDate:start,endDate:end,
  leaveType,reason:reason.trim(),calendarDays:days,status:'requested'};
}
export function overlappingLeave(candidate,existing){
 return existing.some(x=>['requested','manager_approved','approved'].includes(x.status)&&
  candidate.startDate<=x.endDate&&candidate.endDate>=x.startDate);
}
export function leaveDecision(previous,next,decisionReason){
 if(previous?.status!=='requested'||!['approved','rejected'].includes(next))
  throw new Error('Invalid leave decision');
 if(next==='rejected'&&(typeof decisionReason!=='string'||!decisionReason.trim()||decisionReason.length>500))
  throw new Error('Rejection reason required');
 return {status:next,decisionReason:next==='rejected'?decisionReason.trim():null};
}
