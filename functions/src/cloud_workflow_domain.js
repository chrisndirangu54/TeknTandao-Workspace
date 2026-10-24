// Pure transition engine; the executor must revalidate policy and revision atomically.
const EDGES={
 proposed:['validated','cancelled'],
 validated:['awaiting_customer','cancelled'],
 awaiting_customer:['awaiting_operator','rejected'],
 awaiting_operator:['queued','rejected'],
 queued:['running','cancelled'],
 running:['verifying','failed'],
 verifying:['succeeded','failed','rollback_requested'],
 failed:['rollback_requested','cancelled'],
 rollback_requested:['rolled_back','manual_intervention'],
 succeeded:[],rejected:[],cancelled:[],rolled_back:[],manual_intervention:[]
};
export function transitionCloudJob(current,next,guard={}){
 if(!Object.hasOwn(EDGES,current)||!EDGES[current].includes(next))throw Error('Invalid transition');
 if(next==='queued'&&!(guard.customerApproved&&guard.operatorApproved&&guard.budgetReviewed))
  throw Error('Missing approval or budget review');
 if(next==='running'&&!(guard.idempotencyKey&&guard.executionIdentityVerified))
  throw Error('Missing execution safeguards');
 return Object.freeze({state:next,previous:current,requiresAudit:true});
}
export function planRetry(attempt,{maximum=3,baseMs=1000}={}){
 if(!Number.isInteger(attempt)||attempt<0||!Number.isInteger(maximum)||maximum<1||maximum>10)throw Error('Invalid retry configuration');
 return attempt>=maximum?{retry:false,deadLetter:true}:{retry:true,delayMs:Math.min(baseMs*2**attempt,60000),deadLetter:false};
}
