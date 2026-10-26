import {identifier} from './domain.js';
export function performanceFeedback(input){
 const category=input?.category;
 if(!['recognition','coaching','check_in'].includes(category))throw new Error('Invalid feedback category');
 if(typeof input?.message!=='string'||!input.message.trim()||input.message.length>2000)
  throw new Error('Feedback message required');
 return {category,message:input.message.trim(),visibility:'participants'};
}
export function developmentPlan(input){
 const title=input?.title,description=input?.description,dueDate=input?.dueDate;
 if(typeof title!=='string'||!title.trim()||title.length>160)throw new Error('Development title required');
 if(typeof description!=='string'||!description.trim()||description.length>1500)
  throw new Error('Development description required');
 if(typeof dueDate!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(dueDate)||
    Number.isNaN(Date.parse(dueDate+'T00:00:00Z'))||
    new Date(dueDate+'T00:00:00Z').toISOString().slice(0,10)!==dueDate)
  throw new Error('Invalid development due date');
 return {title:title.trim(),description:description.trim(),dueDate,status:'planned'};
}
export function advanceDevelopmentPlan(current,next){
 const transitions={planned:['in_progress','cancelled'],in_progress:['completed','blocked','cancelled'],
  blocked:['in_progress','cancelled'],completed:[],cancelled:[]};
 if(!current||!Object.hasOwn(transitions,current.status)||!transitions[current.status].includes(next))
  throw new Error('Invalid development plan transition');
 return {status:next};
}
