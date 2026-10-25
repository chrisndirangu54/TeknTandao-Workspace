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
