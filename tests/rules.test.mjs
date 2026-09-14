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
    await setDoc(doc(db, 'organizations/a/websiteAssets/asset_one'), {name:'hero.webp',url:'https://cdn.example/hero.webp'});
    await setDoc(doc(db, 'organizations/a/websiteCmsCollections/posts'), {collectionId:'posts',name:'Posts',fields:[],publicRead:true});
    await setDoc(doc(db, 'organizations/a/websiteCmsCollections/posts/entries/post_one'), {published:true,values:{title:'Hello'}});
    await setDoc(doc(db, 'organizations/a/websitePluginInstalls/maps_plus'), {active:true});
    await setDoc(doc(db, 'organizations/a/websiteCollaboration/site_one'), {epoch:1});
    await setDoc(doc(db, 'organizations/a/websiteCollaboration/site_one/ops/op_one'), {actorId:'clerk',clock:1});
    await setDoc(doc(db, 'organizations/a/websiteCollaboration/site_one/presence/clerk'), {actorId:'clerk'});

    await setDoc(doc(db, 'organizations/a/websiteProjectEvents/site_one_3'), {revision:3});
    await setDoc(doc(db, 'organizations/a/websiteVersions/site_one_1'), {version:1});
    await setDoc(doc(db, 'organizations/a/websiteTemplateEarnings/sale_one'), {sellerNetMinor:450000});
    await setDoc(doc(db, 'organizations/a/websiteDomains/www_example_com'), {domain:'www.example.com'});
    await setDoc(doc(db, 'organizations/a/websiteAssetUploads/upload_one'), {state:'awaiting_upload'});
    await setDoc(doc(db, 'organizations/a/websiteExperiments/hero_test'), {status:'active'});
    await setDoc(doc(db, 'organizations/a/websiteExperimentStats/hero_a_today'), {exposures:10});
    await setDoc(doc(db, 'organizations/a/websiteAnalyticsDaily/public_today'), {views:20});
    await setDoc(doc(db, 'organizations/a/websiteFormSubmissions/form_one'), {formId:'contact'});
    await setDoc(doc(db, 'organizations/a/websiteFormSpam/spam_one'), {formId:'contact'});
    await setDoc(doc(db, 'organizations/a/websiteFormStats/contact_today'), {submissions:3});
    await setDoc(doc(db, 'organizations/a/websiteCreatorPayoutProfiles/default'), {provider:'paystack'});
    await setDoc(doc(db, 'organizations/a/websiteCreatorPayouts/wp_one'), {state:'processing'});
    await setDoc(doc(db, 'organizations/a/websiteAiPlans/plan_one'), {state:'proposed',summary:'Private AI plan'});
    await setDoc(doc(db, 'organizations/a/websiteAiActionRequests/request_one'), {state:'pending_approval'});

    await setDoc(doc(db, 'publishedWebsiteSites/public_one'), {publicId:'public_one',version:1,document:{title:'Public'}});
    await setDoc(doc(db, 'publishedWebsiteDomains/www.example.com'), {publicId:'public_one',active:true});
    await setDoc(doc(db, 'websitePublicSiteOwners/public_one'), {orgId:'a',projectId:'site_one'});
    await setDoc(doc(db, 'websitePlugins/maps_plus'), {name:'Maps Plus',status:'published'});
    await setDoc(doc(db, 'websiteFormRateLimits/public_one_1_hash'), {count:1});

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

test('website collaborators can read authoring, assets, CMS, plugin installs and collaboration state', async () => {
  const clerk = env.authenticatedContext('clerk').firestore();
  for (const path of [
    'websiteProjects/site_one',
    'websiteTemplateEntitlements/template_one',
    'websiteAssets/asset_one',
    'websiteCmsCollections/posts',
    'websiteCmsCollections/posts/entries/post_one',
    'websitePluginInstalls/maps_plus',
    'websiteCollaboration/site_one',
    'websiteCollaboration/site_one/ops/op_one',
    'websiteCollaboration/site_one/presence/clerk'
  ]) await assertSucceeds(getDoc(doc(clerk, `organizations/a/${path}`)));
});

test('website infrastructure, release, AI governance, submissions, analytics and payouts remain owner-only', async () => {
  const owner = env.authenticatedContext('a').firestore();
  const clerk = env.authenticatedContext('clerk').firestore();
  for (const path of [
    'websiteProjectEvents/site_one_3','websiteVersions/site_one_1','websiteTemplateEarnings/sale_one',
    'websiteDomains/www_example_com','websiteAssetUploads/upload_one','websiteExperiments/hero_test',
    'websiteExperimentStats/hero_a_today','websiteAnalyticsDaily/public_today',
    'websiteFormSubmissions/form_one','websiteFormSpam/spam_one','websiteFormStats/contact_today',
    'websiteCreatorPayoutProfiles/default','websiteCreatorPayouts/wp_one',
    'websiteAiPlans/plan_one','websiteAiActionRequests/request_one'
  ]) {
    await assertSucceeds(getDoc(doc(owner, `organizations/a/${path}`)));
    await assertFails(getDoc(doc(clerk, `organizations/a/${path}`)));
  }
});

test('only published site snapshots are public; tenant/domain/plugin/rate-limit metadata stays private', async () => {
  const publicDb = env.unauthenticatedContext().firestore();
  await assertSucceeds(getDoc(doc(publicDb, 'publishedWebsiteSites/public_one')));
  for (const path of [
    'publishedWebsiteDomains/www.example.com',
    'websitePublicSiteOwners/public_one',
    'websitePlugins/maps_plus',
    'websiteFormRateLimits/public_one_1_hash'
  ]) await assertFails(getDoc(doc(publicDb, path)));
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

test('clients cannot mutate server-owned builder, AI, platform, payment or control-plane state', async () => {
  const db = env.authenticatedContext('a').firestore();
  for (const path of [
    'members/attacker','apps/crm','payments/forged','contacts/customer','taxOutbox/fake','mc25_mining_operations/forged',
    'websiteProjects/forged','websiteTemplateEntitlements/forged','websiteProjectEvents/forged','websiteVersions/forged','websiteTemplateEarnings/forged',
    'websiteAssets/forged','websiteCmsCollections/forged','websitePluginInstalls/forged','websiteCollaboration/forged','websiteDomains/forged',
    'websiteAssetUploads/forged','websiteExperiments/forged','websiteExperimentStats/forged','websiteAnalyticsDaily/forged',
    'websiteFormSubmissions/forged','websiteFormSpam/forged','websiteFormStats/forged','websiteCreatorPayoutProfiles/forged','websiteCreatorPayouts/forged',
    'websiteAiPlans/forged','websiteAiActionRequests/forged',
    'businessGraphNodes/forged','businessGraphEdges/forged','eventBus/forged','automationRules/forged','agents/forged',
    'agentApprovals/forged','agentPermits/forged','agentExecutions/forged','agentAudit/forged','agentUsage/forged',
    'syncReceipts/forged','aiUsage/forged','aiFinOpsConfig/forged'
  ]) await assertFails(setDoc(doc(db, `organizations/a/${path}`), {role:'owner',state:'paid'}));
  for (const path of [
    'publishedWebsiteSites/forged','publishedWebsiteDomains/forged','websitePublicSiteOwners/forged','websitePlugins/forged','websiteFormRateLimits/forged'
  ]) await assertFails(setDoc(doc(db, path), {state:'forged'}));
});
