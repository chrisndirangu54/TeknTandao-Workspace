export function hrOperationsSummary(punches,leaves,{month,limit=50}={}){
 if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)||!Number.isInteger(limit)||limit<1||limit>100||
 !Array.isArray(punches)||!Array.isArray(leaves)||punches.length>500||leaves.length>500)
 throw new Error('Invalid HR snapshot');
 const monthStart=month+'-01',monthEnd=month+'-31';
 const relevantPunches=punches.filter(p=>typeof p.date==='string'&&p.date>=monthStart&&p.date<=monthEnd);
 const relevantLeaves=leaves.filter(l=>typeof l.startDate==='string'&&typeof l.endDate==='string'&&l.startDate<=monthEnd&&l.endDate>=monthStart);
 const missingCheckout=relevantPunches.filter(p=>p.checkIn&&!p.checkOut);
 const invalidPunches=relevantPunches.filter(p=>!p.checkIn||p.checkOut&&Date.parse(p.checkOut)<Date.parse(p.checkIn));
 const byStatus={};
 for(const leave of relevantLeaves){const key=String(leave.status||'unknown');byStatus[key]=(byStatus[key]||0)+1;}
 return {month,attendance:{recordedPunches:relevantPunches.length,employeeCount:new Set(relevantPunches.map(x=>x.employeeUid).filter(Boolean)).size,
  missingCheckoutCount:missingCheckout.length,invalidPunchCount:invalidPunches.length},
  leave:{requestCount:relevantLeaves.length,byStatus},
  exceptions:[...missingCheckout.map(x=>({type:'missing_checkout',recordId:x.id,employeeUid:x.employeeUid})),
   ...invalidPunches.map(x=>({type:'invalid_punch',recordId:x.id,employeeUid:x.employeeUid}))].slice(0,limit),
  readOnly:true,notes:['Punch count is not a measure of attendance compliance without scheduled shifts.','Missing checkout is an exception for human review, not proof of absence or misconduct.','Leave statuses are recorded requests, not inferred entitlements.']};
}
