export const bootstrapSuperAdminEmail='chrisndirangu54@gmail.com';

export function isBootstrapSuperAdminToken(token={}) {
  return String(token.email||'').toLowerCase()===bootstrapSuperAdminEmail &&
    token.email_verified===true;
}

export function isSuperAdminToken(token={}) {
  return token.superAdmin===true || isBootstrapSuperAdminToken(token);
}

export function canMutateProtectedAdmin({actorUid,targetUid,targetEmail,operation}) {
  if(targetEmail?.toLowerCase()===bootstrapSuperAdminEmail) return false;
  if(['delete-user','revoke-admin'].includes(operation) && actorUid===targetUid) return false;
  return true;
}
