import {readFileSync} from 'node:fs';
import {before, after, test} from 'node:test';
import {createRequire} from 'node:module';
const require = createRequire(import.meta.url);
const {initializeTestEnvironment, assertFails, assertSucceeds} = require('@firebase/rules-unit-testing');
const {doc, setDoc, getDoc, Timestamp} = require('firebase/firestore');
let env;
before(async () => {
  env = await initializeTestEnvironment({projectId: 'demo-tandao', firestore: {rules: readFileSync('firestore.rules', 'utf8')}});
  await env.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    for (const org of ['a','b']) {
      await setDoc(doc(db, `organizations/${org}/members/${org}`), {role: 'owner', apps: []});
      await setDoc(doc(db, `organizations/${org}/apps/crm`), {expiresAt: Timestamp.fromMillis(Date.now() + 3600000)});
      await setDoc(doc(db, `organizations/${org}/contacts/customer`), {name: 'Customer'});
    }
    await setDoc(doc(db, 'organizations/a/members/clerk'), {role:'member',apps:['crm']});
    await setDoc(doc(db, 'organizations/a/apps/hospital'), {expiresAt: Timestamp.fromMillis(Date.now() + 3600000)});
    await setDoc(doc(db, 'organizations/a/modules/hospital/records/patient'), {name:'Private'});
    await setDoc(doc(db, 'organizations/a/apps/hr'), {expiresAt: Timestamp.fromMillis(1)});
    await setDoc(doc(db, 'organizations/a/modules/hr/records/employee'), {name:'Employee'});
  });
});
after(async () => { await env?.cleanup(); });
test('tenant isolation and authentication', async () => {
  await assertSucceeds(getDoc(doc(env.authenticatedContext('a').firestore(), 'organizations/a/contacts/customer')));
  await assertFails(getDoc(doc(env.authenticatedContext('b').firestore(), 'organizations/a/contacts/customer')));
  await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), 'organizations/a/contacts/customer')));
});
test('app permission and expiry protect sensitive records even from another app user', async () => {
  const clerk = env.authenticatedContext('clerk').firestore();
  await assertSucceeds(getDoc(doc(clerk, 'organizations/a/contacts/customer')));
  await assertFails(getDoc(doc(clerk, 'organizations/a/modules/hospital/records/patient')));
  await assertFails(getDoc(doc(env.authenticatedContext('a').firestore(), 'organizations/a/modules/hr/records/employee')));
});
test('clients cannot grant roles, renew subscriptions, forge payment or edit records', async () => {
  const db = env.authenticatedContext('a').firestore();
  for (const path of ['members/attacker','apps/crm','payments/forged','contacts/customer','taxOutbox/fake']) await assertFails(setDoc(doc(db, `organizations/a/${path}`), {role:'owner',state:'paid'}));
});
