import './index.js';
import {randomBytes} from 'node:crypto';
import {getAuth} from 'firebase-admin/auth';
import {FieldValue, getFirestore} from 'firebase-admin/firestore';
import {HttpsError, onCall} from 'firebase-functions/v2/https';
import {z} from 'zod';

const db=getFirestore();
const auth=getAuth();
const region='europe-west1';
export const BOOTSTRAP_SUPER_ADMIN_EMAIL='chrisndirangu54@gmail.com';
const stamp=()=>FieldValue.serverTimestamp();
const emailSchema=z.string().trim().email().max(254);
const idSchema=z.string().trim().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/);
const callable=handler=>onCall({region,timeoutSeconds:120},async request=>{
  try{return await handler(request);}
  catch(error){if(error instanceof HttpsError)throw error;throw new HttpsError('failed-precondition',String(error?.message||'Request failed').slice(0,500));}
});

function signedIn(request){
  if(!request.auth)throw new HttpsError('unauthenticated','Sign in first');
  return request.auth;
}

async function isBootstrap(request){
  const session=signedIn(request);
  const email=String(session.token.email||'').toLowerCase();
  return email===BOOTSTRAP_SUPER_ADMIN_EMAIL && session.token.email_verified===true;
}

async function requireSuperAdmin(request){
  const session=signedIn(request);
  if(session.token.superAdmin===true || await isBootstrap(request)) return session;
  throw new HttpsError('permission-denied','Super administrator required');
}

async function setAdminClaims(uid,enabled){
  const user=await auth.getUser(uid);
  const claims={...(user.customClaims||{})};
  if(enabled){
    claims.superAdmin=true;
    claims.platformAdmin=true;
  }else{
    delete claims.superAdmin;
    delete claims.platformAdmin;
  }
  await auth.setCustomUserClaims(uid,claims);
}

async function adminRecord(uid){
  return (await db.doc(`platformSuperAdmins/${uid}`).get()).data();
}

export const getSuperAdminContext=callable(async request=>{
  const session=signedIn(request);
  const bootstrap=await isBootstrap(request);
  const privileged=session.token.superAdmin===true || bootstrap;
  if(!privileged)return {isSuperAdmin:false,isBootstrap:false};

  if(bootstrap && session.token.superAdmin!==true){
    await setAdminClaims(session.uid,true);
    await db.doc(`platformSuperAdmins/${session.uid}`).set({
      email:BOOTSTRAP_SUPER_ADMIN_EMAIL,
      bootstrap:true,
      active:true,
      grantedBy:'system-bootstrap',
      updatedAt:stamp()
    },{merge:true});
  }
  return {isSuperAdmin:true,isBootstrap:bootstrap,refreshToken:bootstrap && session.token.superAdmin!==true};
});

export const getSuperAdminOverview=callable(async request=>{
  await requireSuperAdmin(request);
  const [usersPage,organizations,admins]=await Promise.all([
    auth.listUsers(200),
    db.collection('organizations').limit(200).get(),
    db.collection('platformSuperAdmins').limit(100).get()
  ]);
  const adminIds=new Set(admins.docs.filter(d=>d.data()?.active!==false).map(d=>d.id));
  return {
    users:usersPage.users.map(u=>({
      uid:u.uid,email:u.email||'',displayName:u.displayName||'',disabled:u.disabled,
      emailVerified:u.emailVerified,isSuperAdmin:adminIds.has(u.uid)||u.customClaims?.superAdmin===true,
      createdAt:u.metadata.creationTime,lastSignInAt:u.metadata.lastSignInTime||null
    })),
    workspaces:organizations.docs.map(d=>({id:d.id,...d.data()})),
    superAdmins:admins.docs.map(d=>({uid:d.id,...d.data()}))
  };
});

export const createPlatformUser=callable(async request=>{
  const actor=await requireSuperAdmin(request);
  const input=z.object({email:emailSchema,displayName:z.string().trim().min(1).max(120)}).strict().parse(request.data);
  const tempPassword=randomBytes(24).toString('base64url')+'A1!';
  const created=await auth.createUser({email:input.email,displayName:input.displayName,password:tempPassword,emailVerified:false,disabled:false});
  const resetLink=await auth.generatePasswordResetLink(input.email);
  await db.doc(`platformAudit/${db.collection('platformAudit').doc().id}`).set({
    action:'user.create',targetUid:created.uid,targetEmail:input.email,actorUid:actor.uid,createdAt:stamp()
  });
  return {uid:created.uid,email:input.email,passwordResetLink:resetLink};
});

export const updatePlatformUser=callable(async request=>{
  const actor=await requireSuperAdmin(request);
  const input=z.object({
    uid:idSchema,
    email:emailSchema.optional(),
    displayName:z.string().trim().min(1).max(120).optional(),
    disabled:z.boolean().optional()
  }).strict().parse(request.data);
  const target=await auth.getUser(input.uid);
  if(target.email?.toLowerCase()===BOOTSTRAP_SUPER_ADMIN_EMAIL && input.disabled===true) throw new Error('Bootstrap super admin cannot be disabled');
  await auth.updateUser(input.uid,{email:input.email,displayName:input.displayName,disabled:input.disabled});
  await db.collection('platformAudit').add({action:'user.update',targetUid:input.uid,actorUid:actor.uid,changes:Object.keys(input).filter(k=>k!=='uid'),createdAt:stamp()});
  return {ok:true};
});

export const deletePlatformUser=callable(async request=>{
  const actor=await requireSuperAdmin(request);
  const input=z.object({uid:idSchema,confirmEmail:emailSchema}).strict().parse(request.data);
  if(input.uid===actor.uid) throw new Error('You cannot delete your own administrator account');
  const target=await auth.getUser(input.uid);
  if((target.email||'').toLowerCase()!==input.confirmEmail.toLowerCase()) throw new Error('Email confirmation does not match the target user');
  if(target.email?.toLowerCase()===BOOTSTRAP_SUPER_ADMIN_EMAIL) throw new Error('Bootstrap super admin cannot be deleted');
  if((await adminRecord(input.uid))?.active!==false && ((await adminRecord(input.uid))?.active===true || target.customClaims?.superAdmin===true)) throw new Error('Revoke super-admin access before deleting this user');
  await auth.deleteUser(input.uid);
  await db.collection('platformAudit').add({action:'user.delete',targetUid:input.uid,targetEmail:input.confirmEmail,actorUid:actor.uid,createdAt:stamp()});
  return {ok:true};
});

export const grantSuperAdmin=callable(async request=>{
  const actor=await requireSuperAdmin(request);
  const email=emailSchema.parse(request.data.email);
  const target=await auth.getUserByEmail(email);
  await setAdminClaims(target.uid,true);
  await db.doc(`platformSuperAdmins/${target.uid}`).set({email:target.email,bootstrap:target.email?.toLowerCase()===BOOTSTRAP_SUPER_ADMIN_EMAIL,active:true,grantedBy:actor.uid,updatedAt:stamp()},{merge:true});
  await db.collection('platformAudit').add({action:'superadmin.grant',targetUid:target.uid,targetEmail:target.email,actorUid:actor.uid,createdAt:stamp()});
  return {uid:target.uid,email:target.email};
});

export const revokeSuperAdmin=callable(async request=>{
  const actor=await requireSuperAdmin(request);
  const uid=idSchema.parse(request.data.uid);
  if(uid===actor.uid) throw new Error('You cannot revoke your own super-admin access');
  const target=await auth.getUser(uid);
  if(target.email?.toLowerCase()===BOOTSTRAP_SUPER_ADMIN_EMAIL) throw new Error('Bootstrap super admin cannot be revoked');
  await setAdminClaims(uid,false);
  await db.doc(`platformSuperAdmins/${uid}`).set({email:target.email||'',active:false,revokedBy:actor.uid,updatedAt:stamp()},{merge:true});
  await db.collection('platformAudit').add({action:'superadmin.revoke',targetUid:uid,targetEmail:target.email||'',actorUid:actor.uid,createdAt:stamp()});
  return {ok:true};
});

export const updateWorkspaceAsSuperAdmin=callable(async request=>{
  const actor=await requireSuperAdmin(request);
  const input=z.object({
    workspaceId:idSchema,
    name:z.string().trim().min(1).max(120).optional(),
    archived:z.boolean().optional()
  }).strict().parse(request.data);
  const ref=db.doc(`organizations/${input.workspaceId}`);
  if(!(await ref.get()).exists) throw new Error('Workspace not found');
  const updates={updatedAt:stamp(),updatedBy:actor.uid};
  if(input.name!==undefined)updates.name=input.name;
  if(input.archived!==undefined)updates.archived=input.archived;
  await ref.set(updates,{merge:true});
  await db.collection('platformAudit').add({action:'workspace.update',workspaceId:input.workspaceId,actorUid:actor.uid,changes:Object.keys(input).filter(k=>k!=='workspaceId'),createdAt:stamp()});
  return {ok:true};
});

export const addWorkspaceMemberAsSuperAdmin=callable(async request=>{
  const actor=await requireSuperAdmin(request);
  const input=z.object({workspaceId:idSchema,email:emailSchema,role:z.enum(['owner','member']).default('member'),apps:z.array(z.string()).max(100).default([])}).strict().parse(request.data);
  const target=await auth.getUserByEmail(input.email);
  const org=db.doc(`organizations/${input.workspaceId}`);
  const orgSnap=await org.get();
  if(!orgSnap.exists)throw new Error('Workspace not found');
  if(input.role==='owner' && orgSnap.data()?.owner!==target.uid) throw new Error('Use owner transfer workflow before assigning owner role');
  await org.collection('members').doc(target.uid).set({role:input.role,apps:[...new Set(input.apps)],updatedAt:stamp(),updatedBy:actor.uid},{merge:true});
  await db.collection('platformAudit').add({action:'workspace.member.add',workspaceId:input.workspaceId,targetUid:target.uid,actorUid:actor.uid,createdAt:stamp()});
  return {uid:target.uid};
});

export const removeWorkspaceMemberAsSuperAdmin=callable(async request=>{
  const actor=await requireSuperAdmin(request);
  const input=z.object({workspaceId:idSchema,uid:idSchema}).strict().parse(request.data);
  const org=db.doc(`organizations/${input.workspaceId}`);
  const orgData=(await org.get()).data();
  if(!orgData)throw new Error('Workspace not found');
  if(orgData.owner===input.uid)throw new Error('Workspace owner cannot be removed; transfer ownership first');
  await org.collection('members').doc(input.uid).delete();
  await db.collection('platformAudit').add({action:'workspace.member.remove',workspaceId:input.workspaceId,targetUid:input.uid,actorUid:actor.uid,createdAt:stamp()});
  return {ok:true};
});

export const deleteWorkspaceAsSuperAdmin=callable(async request=>{
  const actor=await requireSuperAdmin(request);
  const input=z.object({workspaceId:idSchema,confirmWorkspaceId:idSchema}).strict().parse(request.data);
  if(input.workspaceId!==input.confirmWorkspaceId)throw new Error('Workspace confirmation does not match');
  const ref=db.doc(`organizations/${input.workspaceId}`);
  const snap=await ref.get();
  if(!snap.exists)throw new Error('Workspace not found');
  if(snap.data()?.owner===actor.uid)throw new Error('Move your own active workspace before deleting it');
  await db.recursiveDelete(ref);
  await db.collection('platformAudit').add({action:'workspace.delete',workspaceId:input.workspaceId,actorUid:actor.uid,createdAt:stamp()});
  return {ok:true};
});
