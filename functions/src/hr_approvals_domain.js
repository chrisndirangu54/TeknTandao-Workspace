import {identifier} from './domain.js';
export function authorizeLeaveApprover({member,assignment,employee,approverUid}){
 if(member?.role==='owner')return true;
 if(!assignment||assignment.active!==true||assignment.role!=='leave_manager')
  throw new Error('Active leave manager assignment required');
 if(assignment.managerUid!==approverUid)throw new Error('Manager identity mismatch');
 if(typeof employee?.department!=='string'||!employee.department||
    !Array.isArray(assignment.departments)||!assignment.departments.includes(employee.department))
  throw new Error('Employee outside manager department');
 if(employee.portalUid===approverUid)throw new Error('Self approval prohibited');
 return true;
}
export function validateLeaveManagerAssignment({managerUid,departments,active}){
 identifier(managerUid);
 if(typeof active!=='boolean'||!Array.isArray(departments)||!departments.length||departments.length>30||
   departments.some(d=>typeof d!=='string'||!d.trim()||d.length>100))
  throw new Error('Invalid manager assignment');
 return {managerUid,role:'leave_manager',active,departments:[...new Set(departments.map(x=>x.trim()))]};
}
