// Explicit state machines prevent staff from skipping required operational stages.
export function transitionEncounter(current,next){
 const allowed={scheduled:['checked_in','cancelled'],checked_in:['in_consultation','cancelled'],
 in_consultation:['completed'],completed:[],cancelled:[]};
 if(!Object.hasOwn(allowed,current)||!allowed[current].includes(next))
  throw new Error('Invalid clinical encounter transition');
 return next;
}
export function transitionAssessment(current,next){
 const allowed={draft:['review'],review:['draft','published'],published:[]};
 if(!Object.hasOwn(allowed,current)||!allowed[current].includes(next))
  throw new Error('Invalid school assessment transition');
 return next;
}
export function assessmentScore(score,maxScore){
 if(!Number.isSafeInteger(score)||!Number.isSafeInteger(maxScore)||maxScore<=0||maxScore>10000||score<0||score>maxScore)
  throw new Error('Invalid assessment score');
 return {score,maxScore,percentBasisPoints:Math.round(score/maxScore*10000)};
}
