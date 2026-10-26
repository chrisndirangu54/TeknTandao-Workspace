export function payrollAuthorizationDraft(register, grossMinor, explanation){
 if(!register||typeof register.digest!=='string'||!/^[a-f0-9]{64}$/.test(register.digest)||
  register.payrollPosted!==false)throw new Error('Unposted reconciled time register required');
 if(!Number.isSafeInteger(grossMinor)||grossMinor<=0||grossMinor>1000000000)
  throw new Error('Invalid proposed gross pay');
 if(typeof explanation!=='string'||!explanation.trim()||explanation.length>1000)
  throw new Error('Payroll proposal explanation required');
 return {registerDigest:register.digest,period:register.period,grossMinor,
   explanation:explanation.trim(),status:'pending',payrollPosted:false};
}
export function authorizePayrollProposal(proposal,decision,note,reviewerUid){
 if(proposal?.status!=='pending'||!['approved','rejected'].includes(decision))
  throw new Error('Proposal already decided');
 if(!reviewerUid||proposal.preparedBy===reviewerUid)throw new Error('Independent reviewer required');
 if(typeof note!=='string'||!note.trim()||note.length>1000)
  throw new Error('Review note required');
 return {status:decision,reviewNote:note.trim()};
}
