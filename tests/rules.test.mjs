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
    await setDoc(doc(db, 'organizations/a/members/clerk'), {
      role:'member',
      apps:['crm','payments','mc25_mining_operations','mc14_website_builder']
    });
    await setDoc(doc(db, 'organizations/a/apps/hospital'), {expiresAt: Timestamp.fromMillis(Date.now() + 3600000)});
    await setDoc(doc(db, 'organizations/a/modules/hospital/records/patient'), {name:'Private'});
    await setDoc(doc(db, 'organizations/a/apps/hr'), {expiresAt: Timestamp.fromMillis(1)});
    await setDoc(doc(db, 'organizations/a/modules/hr/records/employee'), {name:'Employee'});
    await setDoc(doc(db, 'organizations/a/apps/payments'), {expiresAt: Timestamp.fromMillis(Date.now() + 3600000)});
    await setDoc(doc(db, 'organizations/a/payments/settlement'), {amount:120000,state:'paid'});
    await setDoc(doc(db, 'organizations/a/apps/mc25_mining_operations'), {expiresAt: Timestamp.fromMillis(Date.now() + 3600000)});
    await setDoc(doc(db, 'organizations/a/mc25_mining_operations/shift-one'), {site:'Kendege',status:'ACTIVE'});
    await setDoc(doc(db, 'organizations/a/apps/mc14_website_builder'), {expiresAt: Timestamp.fromMillis(Date.now() + 3600000)});
    await setDoc(doc(db, 'organizations/a/websiteProjects/site_one'), {title:'Live JSON Site',revision:3});
    await setDoc(doc(db, 'organizations/a/websiteTemplateEntitlements/template_one'), {license:'commercial'});
    await setDoc(doc(db, 'organizations/a/websiteProjectEvents/site_one_3'), {revision:3});
    await setDoc(doc(db, 'organizations/a/websiteVersions/site_one_1'), {version:1});
    await setDoc(doc(db, 'organizations/a/websiteTemplateEarnings/sale_one'), {sellerNetMinor:450000});
    await setDoc(doc(db, 'publishedWebsiteSites/public_one'), {publicId:'public_one',version:1,document:{title:'Public'}});
    await setDoc(doc(db, 'organizations/a/businessGraphNodes/customer_one'), {type:'customer',label:'Customer One'});
    await setDoc(doc(db, 'organizations/a/automationRules/rule_one'), {name:'Owner workflow',enabled:true});
    await setDoc(doc(db, 'organizations/a/agents/finance_agent'), {displayName:'Finance Agent'});
    await setDoc(doc(db, 'organizations/a/agentExecutions/permit_one'), {state:'completed'});
    await setDoc(doc(db, 'organizations/a/syncReceipts/crm_phone_1'), {status:'applied'});
    await setDoc(doc(db, 'organizations/a/aiUsage/ai_req_1'), {provider:'openai',costMinor:25});
    await setDoc(doc(db, 'organizations/a/aiFinOpsConfig/default'), {monthlyBudgetMinor:10000});
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
test('master app collections are entitlement-bound without weakening reserved collections', async () => {
  const clerk = env.authenticatedContext('clerk').firestore();
  await assertSucceeds(getDoc(doc(clerk, 'organizations/a/mc25_mining_operations/shift-one')));
  await assertFails(getDoc(doc(clerk, 'organizations/a/payments/settlement')));
  await assertSucceeds(getDoc(doc(env.authenticatedContext('a').firestore(), 'organizations/a/payments/settlement')));
});
test('website collaborators can read project JSON but version and earnings history remain owner-only', async () => {
  const owner = env.authenticatedContext('a').firestore();
  const clerk = env.authenticatedContext('clerk').firestore();
  await assertSucceeds(getDoc(doc(clerk, 'organizations/a/websiteProjects/site_one')));
  await assertSucceeds(getDoc(doc(clerk, 'organizations/a/websiteTemplateEntitlements/template_one')));
  for (const path of ['websiteProjectEvents/site_one_3','websiteVersions/site_one_1','websiteTemplateEarnings/sale_one']) {
    await assertSucceeds(getDoc(doc(owner, `organizations/a/${path}`)));
    await assertFails(getDoc(doc(clerk, `organizations/a/${path}`)));
  }
  await assertSucceeds(getDoc(doc(env.unauthenticatedContext().firestore(), 'publishedWebsiteSites/public_one')));
});
test('cross-app SOTA control plane is owner-only on direct Firestore reads', async () => {
  const owner = env.authenticatedContext('a').firestore();
  const clerk = env.authenticatedContext('clerk').firestore();
  for (const path of [
    'businessGraphNodes/customer_one',
    'automationRules/rule_one',
    'agents/finance_agent',
    'agentExecutions/permit_one',
    'syncReceipts/crm_phone_1',
    'aiUsage/ai_req_1',
    'aiFinOpsConfig/default'
  ]) {
    await assertSucceeds(getDoc(doc(owner, `organizations/a/${path}`)));
    await assertFails(getDoc(doc(clerk, `organizations/a/${path}`)));
  }
});
test('clients cannot grant roles, renew subscriptions, forge payments, edit records or mutate server-owned builder/control-plane state', async () => {
  const db = env.authenticatedContext('a').firestore();
  for (const path of [
    'members/attacker','apps/crm','payments/forged','contacts/customer','taxOutbox/fake','mc25_mining_operations/forged',
    'websiteProjects/forged','websiteTemplateEntitlements/forged','websiteProjectEvents/forged','websiteVersions/forged','websiteTemplateEarnings/forged',
    'businessGraphNodes/forged','businessGraphEdges/forged','eventBus/forged','automationRules/forged','agents/forged',
    'agentApprovals/forged','agentPermits/forged','agentExecutions/forged','agentAudit/forged','agentUsage/forged',
    'syncReceipts/forged','aiUsage/forged','aiFinOpsConfig/forged'
  ]) {
    await assertFails(setDoc(doc(db, `organizations/a/${path}`), {role:'owner',state:'paid'}));
  }
  await assertFails(setDoc(doc(db, 'publishedWebsiteSites/forged'), {document:{title:'forged'}}));
});
