import {identifier,optionalText} from './domain.js';

export function maintenanceTicket(input){
 const propertyId=identifier(input?.propertyId);
 const title=optionalText(input?.title,160);
 const description=optionalText(input?.description??'',2000);
 const priority=input?.priority??'normal';
 if(!title)throw new Error('Maintenance title required');
 if(!['low','normal','high','emergency'].includes(priority))throw new Error('Invalid maintenance priority');
 return {propertyId,title,description,priority,status:'open'};
}
export function transitionMaintenance(ticket,next,{note='',assigneeId=null}={}){
 const transitions={open:['assigned','cancelled'],assigned:['in_progress','open','cancelled'],
  in_progress:['resolved','assigned'],resolved:['closed','in_progress'],closed:[],cancelled:[]};
 if(!ticket||!Object.hasOwn(transitions,ticket.status)||!transitions[ticket.status].includes(next))
  throw new Error('Invalid maintenance transition');
 const explanation=optionalText(note,1000);
 if(next==='resolved'&&!explanation)throw new Error('Resolution note required');
 if(next==='assigned'&&!assigneeId&&!ticket.assigneeId)throw new Error('Assignee required');
 return {status:next,note:explanation,
  assigneeId:next==='assigned'?identifier(assigneeId||ticket.assigneeId):ticket.assigneeId??null};
}
