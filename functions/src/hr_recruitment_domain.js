import {identifier} from './domain.js';
const stages=['applied','screening','interview','offer','hired','rejected','withdrawn'];
const next={applied:['screening','rejected','withdrawn'],screening:['interview','rejected','withdrawn'],
 interview:['offer','rejected','withdrawn'],offer:['hired','rejected','withdrawn'],hired:[],rejected:[],withdrawn:[]};
export function candidateApplication(input){
 const name=input?.name,email=input?.email,position=input?.position;
 if(typeof name!=='string'||!name.trim()||name.length>140||typeof email!=='string'||!/^\S+@\S+\.\S+$/.test(email)||email.length>254||
 typeof position!=='string'||!position.trim()||position.length>140)throw new Error('Invalid applicant details');
 return {name:name.trim(),email:email.trim().toLowerCase(),position:position.trim(),stage:'applied'};
}
export function advanceCandidate(candidate,stage,reason){
 if(!next[candidate?.stage]?.includes(stage))throw new Error('Invalid recruiting transition');
 if(['rejected','withdrawn'].includes(stage)&&(typeof reason!=='string'||!reason.trim()||reason.length>500))
  throw new Error('Reason required for closing application');
 return {stage,reason:reason?.trim()||null};
}
export function onboardingTask(input){
 const title=input?.title,assigneeUid=identifier(input?.assigneeUid),dueDate=input?.dueDate;
 if(typeof title!=='string'||!title.trim()||title.length>160||
 typeof dueDate!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(dueDate)||
 Number.isNaN(Date.parse(dueDate+'T00:00:00Z'))||
 new Date(dueDate+'T00:00:00Z').toISOString().slice(0,10)!==dueDate)
  throw new Error('Invalid onboarding task');
 return {title:title.trim(),assigneeUid,dueDate,status:'open'};
}
