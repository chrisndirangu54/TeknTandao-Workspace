// Scoped professional permissions; organization owners remain administrators.
// Explicit assignments are required for non-owner sensitive actions.
const grants={
 hospital:{clinician:['encounter:create','encounter:advance','clinical:write'],receptionist:['encounter:create'],lab_technician:['lab:write']},
 school:{teacher:['assessment:create','assessment:review','grade:write'],principal:['assessment:create','assessment:review','assessment:publish','grade:write']}
};
export function requireVerticalPermission({app,member,assignment,permission}){
 if(member?.role==='owner')return true;
 if(!member||!assignment||assignment.active!==true||assignment.app!==app)
  throw new Error('Active professional assignment required');
 const allowed=grants[app]?.[assignment.role]||[];
 if(!allowed.includes(permission))throw new Error('Professional permission denied');
 return true;
}

export function requireRecordScope({app,member,assignment,record,studentClass}){
 if(member?.role==='owner')return true;
 if(!assignment||assignment.active!==true||assignment.app!==app)
  throw new Error('Active professional assignment required');
 if(app==='hospital'){
   if(typeof record?.patientId!=='string'||!record.patientId||
      !Array.isArray(assignment.patientIds)||!assignment.patientIds.includes(record.patientId))
     throw new Error('Patient not assigned to professional');
   return true;
 }
 if(app==='school'){
   if(typeof studentClass!=='string'||!studentClass||
      !Array.isArray(assignment.classNames)||!assignment.classNames.includes(studentClass))
     throw new Error('Student class not assigned to educator');
   return true;
 }
 throw new Error('Unsupported record scope');
}
