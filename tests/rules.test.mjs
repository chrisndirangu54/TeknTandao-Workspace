import {readFileSync} from 'node:fs';
import {strict as assert} from 'node:assert';
import {before, after, test} from 'node:test';
import {createRequire} from 'node:module';
const require = createRequire(import.meta.url);
const {initializeTestEnvironment, assertFails, assertSucceeds} = require('@firebase/rules-unit-testing');
const {collection, doc, setDoc, getDoc, getDocs, Timestamp, serverTimestamp, writeBatch} = require('firebase/firestore');
let env;
test('time tracking reads require an active subscription and the matching member UID', async () => {
  await env.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    await setDoc(doc(db, 'organizations/a/apps/time'), {expiresAt: Timestamp.fromMillis(Date.now() + 3600000)});
    await setDoc(doc(db, 'organizations/a/timeMembers/a/jobs/job1'), {name: 'Private job'});
    await setDoc(doc(db, 'organizations/a/timeMembers/a/entries/entry1'), {jobId: 'job1'});
  });
  const own = env.authenticatedContext('a').firestore();
  const other = env.authenticatedContext('clerk').firestore();
  await assertSucceeds(getDoc(doc(own, 'organizations/a/timeMembers/a/jobs/job1')));
  await assertSucceeds(getDoc(doc(own, 'organizations/a/timeMembers/a/entries/entry1')));
  await assertFails(getDoc(doc(other, 'organizations/a/timeMembers/a/jobs/job1')));
  await assertFails(getDoc(doc(own, 'organizations/b/timeMembers/a/jobs/job1')));
  await assertFails(setDoc(doc(own, 'organizations/a/timeMembers/a/jobs/forged'), {name: 'Direct write'}));
});
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

test('users can atomically create only their own owner workspace and private profile', async () => {
  const uid = 'self-created-owner';
  const db = env.authenticatedContext(uid).firestore();
  const batch = writeBatch(db);
  batch.set(doc(db, `organizations/${uid}`), {
    name: 'New Workspace',
    createdAt: serverTimestamp(),
    owner: uid,
    currency: 'KES'
  });
  batch.set(doc(db, `organizations/${uid}/members/${uid}`), {role: 'owner', apps: []});
  batch.set(doc(db, `users/${uid}`), {
    orgId: uid,
    displayName: 'New Owner',
    phoneNumber: '+254 712 345 678',
    email: 'owner@example.com',
    photoURL: '',
    updatedAt: serverTimestamp()
  });
  await assertSucceeds(batch.commit());
  await assertSucceeds(getDoc(doc(db, `organizations/${uid}`)));
  await assertSucceeds(getDoc(doc(db, `users/${uid}`)));
  await assertFails(getDoc(doc(env.authenticatedContext('other-user').firestore(), `users/${uid}`)));
  await assertFails(setDoc(
    doc(env.authenticatedContext('other-user').firestore(), `organizations/${uid}/members/other-user`),
    {role: 'owner', apps: []}
  ));
});

test('users cannot create a workspace or profile for another UID', async () => {
  const db = env.authenticatedContext('attacker').firestore();
  const batch = writeBatch(db);
  batch.set(doc(db, 'organizations/victim'), {
    name: 'Forged Workspace',
    createdAt: serverTimestamp(),
    owner: 'victim',
    currency: 'KES'
  });
  batch.set(doc(db, 'organizations/victim/members/attacker'), {role: 'owner', apps: []});
  batch.set(doc(db, 'users/attacker'), {
    orgId: 'victim',
    displayName: 'Attacker',
    phoneNumber: '+254 712 345 678',
    email: 'attacker@example.com',
    photoURL: '',
    updatedAt: serverTimestamp()
  });
  await assertFails(batch.commit());
});

test('workspace owners can invite a user into multiple workspaces without exposing membership lists', async () => {
  const firstOrg = 'workspace-alpha';
  const secondOrg = 'workspace-bravo';
  const firstOwner = 'owner-alpha';
  const secondOwner = 'owner-bravo';
  const invitee = 'multi-workspace-user';
  const firstToken = 'A'.repeat(32);
  const secondToken = 'B'.repeat(32);
  const expiresAt = Timestamp.fromMillis(Date.now() + 30 * 24 * 60 * 60 * 1000);

  await env.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    await setDoc(doc(db, `organizations/${firstOrg}`), {
      name: 'Alpha Workspace', owner: firstOwner, currency: 'KES'
    });
    await setDoc(doc(db, `organizations/${firstOrg}/members/${firstOwner}`), {
      role: 'owner', apps: []
    });
    await setDoc(doc(db, `organizations/${secondOrg}`), {
      name: 'Bravo Workspace', owner: secondOwner, currency: 'KES'
    });
    await setDoc(doc(db, `organizations/${secondOrg}/members/${secondOwner}`), {
      role: 'owner', apps: []
    });
  });

  for (const [org, owner, token, name] of [
    [firstOrg, firstOwner, firstToken, 'Alpha Workspace'],
    [secondOrg, secondOwner, secondToken, 'Bravo Workspace']
  ]) {
    await assertSucceeds(setDoc(
      doc(env.authenticatedContext(owner).firestore(), `organizations/${org}/workspaceInvites/${token}`),
      {
        active: true,
        workspaceId: org,
        workspaceName: name,
        createdBy: owner,
        createdAt: serverTimestamp(),
        expiresAt
      }
    ));
  }

  await assertFails(setDoc(
    doc(env.authenticatedContext('non-owner').firestore(), `organizations/${firstOrg}/workspaceInvites/${'C'.repeat(32)}`),
    {
      active: true,
      workspaceId: firstOrg,
      workspaceName: 'Alpha Workspace',
      createdBy: 'non-owner',
      createdAt: serverTimestamp(),
      expiresAt
    }
  ));

  const joinWorkspace = async (org, token, name, createProfile) => {
    const db = env.authenticatedContext(invitee).firestore();
    const batch = writeBatch(db);
    batch.set(doc(db, `organizations/${org}/members/${invitee}`), {
      role: 'member', apps: [], inviteId: token
    });
    batch.set(doc(db, `users/${invitee}/workspaces/${org}`), {
      workspaceId: org, name, role: 'member', joinedAt: serverTimestamp()
    });
    batch.set(doc(db, `users/${invitee}`), {
      ...(createProfile ? {
        displayName: 'Workspace Member',
        phoneNumber: '+254 712 345 678',
        email: 'member@example.com',
        photoURL: ''
      } : {}),
      orgId: org,
      updatedAt: serverTimestamp()
    }, {merge: true});
    await assertSucceeds(batch.commit());
  };

  await joinWorkspace(firstOrg, firstToken, 'Alpha Workspace', true);
  await joinWorkspace(secondOrg, secondToken, 'Bravo Workspace', false);

  const own = env.authenticatedContext(invitee).firestore();
  const workspaces = await getDocs(collection(own, `users/${invitee}/workspaces`));
  assert.equal(workspaces.size, 2);
  assert.deepEqual(
    workspaces.docs.map(snapshot => snapshot.data().name).sort(),
    ['Alpha Workspace', 'Bravo Workspace']
  );
  await assertSucceeds(getDoc(doc(own, `organizations/${firstOrg}`)));
  await assertSucceeds(getDoc(doc(own, `organizations/${secondOrg}`)));
  await assertFails(getDocs(collection(
    env.authenticatedContext('other-user').firestore(),
    `users/${invitee}/workspaces`
  )));
  await assertFails(getDoc(doc(
    env.unauthenticatedContext().firestore(),
    `organizations/${firstOrg}/workspaceInvites/${firstToken}`
  )));
});

test('talent profiles are opt-in, contact requests require an open role, and only candidates respond', async () => {
  const employerUid = 'talent-employer-owner';
  const candidateUid = 'talent-candidate-uid';
  const employerOrg = 'talent-employer-org';
  const roleId = 'network-role';
  const requestId = 'candidate-introduction';
  await env.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    await setDoc(doc(db, `organizations/${employerOrg}`), {name: 'Network Employer', owner: employerUid});
    await setDoc(doc(db, `organizations/${employerOrg}/members/${employerUid}`), {role: 'owner', apps: []});
  });

  const candidateDb = env.authenticatedContext(candidateUid).firestore();
  await assertSucceeds(setDoc(doc(candidateDb, `talentProfiles/${candidateUid}`), {
    displayAlias: 'Network Pro',
    skills: ['networking', 'linux'],
    targetRoles: ['Network Technician'],
    location: 'Nairobi',
    experienceYears: 4,
    bio: 'Infrastructure operations',
    isPublic: true,
    consentAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  }));
  await assertSucceeds(getDoc(doc(env.authenticatedContext(employerUid).firestore(), `talentProfiles/${candidateUid}`)));
  await assertFails(setDoc(doc(candidateDb, 'talentProfiles/no-consent'), {
    displayAlias: 'Private Candidate',
    skills: ['support'],
    targetRoles: ['Analyst'],
    location: 'Nairobi',
    experienceYears: 1,
    bio: '',
    isPublic: true,
    updatedAt: serverTimestamp()
  }));

  const employerDb = env.authenticatedContext(employerUid).firestore();
  await assertSucceeds(setDoc(doc(employerDb, `talentJobPostings/${roleId}`), {
    employerOrgId: employerOrg,
    employerName: 'Network Employer',
    createdBy: employerUid,
    title: 'Network Support Technician',
    department: 'IT',
    requiredSkills: ['networking', 'linux'],
    location: 'Nairobi',
    experienceYears: 2,
    status: 'OPEN',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  }));
  await assertSucceeds(setDoc(doc(employerDb, `talentContactRequests/${requestId}`), {
    candidateUid,
    candidateAlias: 'Network Pro',
    employerOrgId: employerOrg,
    employerName: 'Network Employer',
    employerOwnerUid: employerUid,
    roleId,
    roleTitle: 'Network Support Technician',
    matchScore: 85,
    matchedSkills: ['networking', 'linux'],
    missingSkills: [],
    type: 'EMPLOYER_INVITE',
    status: 'PENDING',
    createdAt: serverTimestamp()
  }));

  const candidateRequest = doc(candidateDb, `talentContactRequests/${requestId}`);
  await assertSucceeds(getDoc(candidateRequest));
  await assertSucceeds(updateDoc(candidateRequest, {
    status: 'ACCEPTED',
    sharedEmail: 'candidate@example.com',
    updatedAt: serverTimestamp()
  }));
  await assertFails(updateDoc(candidateRequest, {
    status: 'ACCEPTED',
    sharedEmail: 'candidate@example.com',
    updatedAt: serverTimestamp()
  }));
  await assertFails(getDoc(doc(env.authenticatedContext('other-person').firestore(), `talentContactRequests/${requestId}`)));
  await assertFails(updateDoc(doc(employerDb, `talentContactRequests/${requestId}`), {
    status: 'ACCEPTED',
    sharedEmail: 'forged@example.com',
    updatedAt: serverTimestamp()
  }));
});

test('supplier directory listings require owners and quote requests stay within both workspaces', async () => {
  const supplierUid = 'supplier-workspace-owner';
  const buyerUid = 'buyer-workspace-owner';
  const supplierOrg = 'supplier-workspace-org';
  const buyerOrg = 'buyer-workspace-org';
  const requestId = 'supplier-quote-request';
  await env.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    await setDoc(doc(db, `organizations/${supplierOrg}`), {name: 'Nairobi Equipment Co', owner: supplierUid});
    await setDoc(doc(db, `organizations/${supplierOrg}/members/${supplierUid}`), {role: 'owner', apps: []});
    await setDoc(doc(db, `organizations/${buyerOrg}`), {name: 'Market Buyer', owner: buyerUid});
    await setDoc(doc(db, `organizations/${buyerOrg}/members/${buyerUid}`), {role: 'owner', apps: []});
  });

  const supplierDb = env.authenticatedContext(supplierUid).firestore();
  await assertSucceeds(setDoc(doc(supplierDb, `marketplaceSupplierListings/${supplierOrg}`), {
    supplierOrgId: supplierOrg,
    organizationName: 'Nairobi Equipment Co',
    categories: ['Equipment'],
    products: ['Cold room compressor'],
    equipment: ['Refrigeration units'],
    services: ['Installation'],
    regions: ['Nairobi'],
    capacity: 8,
    published: true,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  }));
  await assertSucceeds(getDoc(doc(env.authenticatedContext(buyerUid).firestore(), `marketplaceSupplierListings/${supplierOrg}`)));
  await assertFails(setDoc(doc(env.authenticatedContext('not-supplier-owner').firestore(), 'marketplaceSupplierListings/forged'), {
    supplierOrgId: 'forged',
    organizationName: 'Forged Supplier',
    categories: [], products: [], equipment: [], services: [], regions: [],
    capacity: 0, published: true, createdAt: serverTimestamp(), updatedAt: serverTimestamp()
  }));

  const buyerDb = env.authenticatedContext(buyerUid).firestore();
  await assertSucceeds(setDoc(doc(buyerDb, `marketplaceQuoteRequests/${requestId}`), {
    buyerOrgId: buyerOrg,
    supplierOrgId: supplierOrg,
    supplierName: 'Nairobi Equipment Co',
    createdBy: buyerUid,
    gapKind: 'Equipment / Asset',
    gapTitle: 'Cold room compressor',
    gapDetail: 'Asset status: maintenance due',
    location: 'Nairobi',
    quantity: 1,
    matchScore: 85,
    matchReasons: ['Offers refrigeration units', 'Located in Nairobi'],
    status: 'OPEN',
    createdAt: serverTimestamp()
  }));
  await assertSucceeds(getDoc(doc(supplierDb, `marketplaceQuoteRequests/${requestId}`)));
  await assertFails(getDoc(doc(env.authenticatedContext('unrelated-owner').firestore(), `marketplaceQuoteRequests/${requestId}`)));
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
