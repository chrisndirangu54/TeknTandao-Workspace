import {identifier} from './domain.js';
const validDate=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&!Number.isNaN(Date.parse(v+'T00:00:00Z'))&&new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v;
export function createReview(input){
 const employeeId=identifier(input.employeeId),managerUid=identifier(input.managerUid);
 if(!validDate(input.startDate)||!validDate(input.endDate)||input.startDate>=input.endDate)throw new Error('Invalid review dates');
 if(!Array.isArray(input.goals)||input.goals.length<1||input.goals.length>12)throw new Error('Review must include 1–12 goals');
 const goals=input.goals.map(g=>{
  if(typeof g.title!=='string'||!g.title.trim()||g.title.length>160||
     !Number.isInteger(g.weight)||g.weight<1||g.weight>100)throw new Error('Invalid goal');
  return {title:g.title.trim(),weight:g.weight};
 });
 if(goals.reduce((n,g)=>n+g.weight,0)!==100)throw new Error('Goal weights must total 100');
 return {employeeId,managerUid,startDate:input.startDate,endDate:input.endDate,goals,
  status:'self_assessment',employeeAssessment:null,managerAssessment:null};
}
export function reviewAssessment(review,kind,input){
 const permitted=kind==='employee'?review.status==='self_assessment':kind==='manager'&&review.status==='manager_review';
 if(!permitted)throw new Error('Review not in expected assessment stage');
 if(!Array.isArray(input.ratings)||input.ratings.length!==review.goals.length||
   input.ratings.some(x=>!Number.isInteger(x)||x<1||x>5))throw new Error('Ratings must be integers from 1 to 5');
 if(typeof input.comment!=='string'||!input.comment.trim()||input.comment.length>2000)throw new Error('Assessment comment required');
 const score=review.goals.reduce((n,g,i)=>n+g.weight*input.ratings[i],0)/100;
 return {ratings:input.ratings,comment:input.comment.trim(),weightedScore:score};
}
