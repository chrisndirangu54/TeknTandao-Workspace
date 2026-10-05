import test from 'node:test';
import assert from 'node:assert/strict';
import {bootstrapSuperAdminEmail,isBootstrapSuperAdminToken,isSuperAdminToken,canMutateProtectedAdmin} from '../src/super_admin_domain.js';

test('bootstrap admin requires exact verified email',()=>{
  assert.equal(isBootstrapSuperAdminToken({email:bootstrapSuperAdminEmail,email_verified:true}),true);
  assert.equal(isBootstrapSuperAdminToken({email:bootstrapSuperAdminEmail,email_verified:false}),false);
  assert.equal(isBootstrapSuperAdminToken({email:'other@example.com',email_verified:true}),false);
});

test('custom superAdmin claim grants access',()=>{
  assert.equal(isSuperAdminToken({superAdmin:true}),true);
  assert.equal(isSuperAdminToken({superAdmin:false,email:'other@example.com'}),false);
});

test('bootstrap and self destructive mutations are protected',()=>{
  assert.equal(canMutateProtectedAdmin({actorUid:'a',targetUid:'b',targetEmail:bootstrapSuperAdminEmail,operation:'delete-user'}),false);
  assert.equal(canMutateProtectedAdmin({actorUid:'a',targetUid:'a',targetEmail:'a@example.com',operation:'revoke-admin'}),false);
  assert.equal(canMutateProtectedAdmin({actorUid:'a',targetUid:'b',targetEmail:'b@example.com',operation:'delete-user'}),true);
});
