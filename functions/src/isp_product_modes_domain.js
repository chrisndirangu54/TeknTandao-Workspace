export const ispModeNames=Object.freeze({managed:'third_party_isp_management',operator:'tekntandao_isp'});
export const ispRecordKinds=Object.freeze(['devices','subscribers','incidents','plans','sites']);
export function ispStoragePath(mode,orgId){
 if(!Object.hasOwn(ispModeNames,mode))throw new Error('Invalid ISP mode');
 if(mode==='operator')return 'tekntandaoIsp/operations';
 if(typeof orgId!=='string'||!/^[a-zA-Z0-9_-]{1,100}$/.test(orgId))
  throw new Error('Invalid tenant ID');
 return `organizations/${orgId}/ispManagement/workspace`;
}
export function ispRecordPath(mode,orgId,kind,id){
 if(!ispRecordKinds.includes(kind))throw new Error('Invalid ISP record kind');
 if(typeof id!=='string'||!/^[a-zA-Z0-9_-]{1,100}$/.test(id))
  throw new Error('Invalid record ID');
 return `${ispStoragePath(mode,orgId)}/${kind}/${id}`;
}

// Authorization decisions are enforced server-side; UI mode restrictions are not trusted.
export function canUseIspMode({mode,superAdmin,member,app,hasAppAccess,write=false}) {
 if(!Object.hasOwn(ispModeNames,mode))return false;
 if(mode==='operator')return superAdmin===true;
 if(!member||hasAppAccess!==true)return false;
 if(write&&!['owner','admin'].includes(member.role))return false;
 return true;
}
