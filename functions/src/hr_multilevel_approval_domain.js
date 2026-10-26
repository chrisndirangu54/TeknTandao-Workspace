export function leaveApprovalTransition(previous,decision,actorRole){
 if(!previous||!['requested','manager_approved'].includes(previous.status))throw new Error('Leave request is not awaiting a decision');
 if(!['approved','rejected'].includes(decision))throw new Error('Invalid leave decision');
 if(actorRole==='owner')return {status:decision,final:decision==='approved'};
 if(actorRole!=='manager'||previous.status!=='requested')throw new Error('Only HR may finalize reviewed leave');
 return decision==='approved'?{status:'manager_approved',final:false}:{status:'rejected',final:false};
}
