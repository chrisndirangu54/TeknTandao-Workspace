import {test, after} from 'node:test';
import assert from 'node:assert/strict';
import {getFirestore} from 'firebase-admin/firestore';
import {getApps, deleteApp} from 'firebase-admin/app';
if (!process.env.FIRESTORE_EMULATOR_HOST || process.env.GCLOUD_PROJECT !== 'demo-tandao') throw new Error('Integration tests require the demo-tandao Firestore emulator');
const api = await import('../src/platform_entry.js');
const {productRecordDigest} = await import('../src/website_business_ai_domain.js');
const db = getFirestore();
const owner = `test_${Date.now()}`;
const request = (data, uid = owner) => ({data: {orgId: owner, ...data}, auth: {uid, token: {email: 'owner@example.test'}}});

test('shared workflow enforces auth, dependencies, tenant scope, stock transaction, replay handling and uninstall safety', async () => {
  await assert.rejects(api.createOrganization.run({data: {name: 'No auth'}}));
  await api.createOrganization.run(request({name: 'Integration business'}));

  await api.installApp.run(request({appId:'pos'}));
  assert.equal((await db.doc(`organizations/${owner}/apps/pos`).get()).exists, true);
  assert.equal((await db.doc(`organizations/${owner}/apps/inventory`).get()).exists, true, 'POS must provision required Inventory dependency');
  await assert.rejects(api.uninstallApp.run(request({appId:'inventory'})), /required by pos/);

  for (const appId of ['crm','accounting']) await api.installApp.run(request({appId}));
  const crm = db.doc(`organizations/${owner}/apps/crm`);
  const expiry = (await crm.get()).data().expiresAt.toMillis();
  await api.installApp.run(request({appId:'crm'}));
  assert.equal((await crm.get()).data().expiresAt.toMillis(), expiry, 'reinstall must not renew free trial');

  await assert.rejects(api.saveRecord.run(request({appId:'crm', record:{name:'Intruder'}}, 'stranger')));
  await api.saveRecord.run(request({appId:'crm', id:'customer', record:{name:'Customer'}}));
  await api.saveRecord.run(request({appId:'inventory', id:'tea', record:{name:'Tea',price:12000,stock:3}}));
  await api.installApp.run(request({appId:'marketing'}));
  await api.saveRecord.run(request({appId:'marketing', id:'campaign', record:{name:'Campaign',segment:'SMEs',channel:'WhatsApp',status:'ACTIVE'}}));
  assert.equal((await db.doc(`organizations/${owner}/marketing_campaigns/campaign`).get()).data().segment, 'SMEs');

  // Specialized screens are allowed to use their native primary fields rather
  // than being forced to invent a generic `name` field.
  await api.installApp.run(request({appId:'procurement'}));
  await api.saveRecord.run(request({appId:'procurement', id:'po-one', record:{vendor:'Acme Supplies',item:'Cement',qty:40,status:'ORDERED'}}));
  const purchase = (await db.doc(`organizations/${owner}/procurement_pos/po-one`).get()).data();
  assert.equal(purchase.vendor, 'Acme Supplies');
  assert.equal(purchase.name, 'Acme Supplies');

  // Any master-catalogue app is a real entitlement and persists through the
  // generic top-level app collection used by the shared operational runtime.
  await api.installApp.run(request({appId:'mc25_mining_operations'}));
  await api.saveRecord.run(request({
    appId:'mc25_mining_operations',
    id:'shift-one',
    record:{title:'Kendege Shift',site:'Kendege',material:'Coltan',location:'Pit A',status:'ACTIVE'}
  }));
  const mining = (await db.doc(`organizations/${owner}/mc25_mining_operations/shift-one`).get()).data();
  assert.equal(mining.site, 'Kendege');
  assert.equal(mining.material, 'Coltan');

  const sale = {requestId:'sale-one',productId:'tea',contactId:'customer',quantity:2};
  await Promise.all([api.createSale.run(request(sale)), api.createSale.run(request(sale))]);
  assert.equal((await db.doc(`organizations/${owner}/products/tea`).get()).data().stock, 1);
  await assert.rejects(api.createSale.run(request({...sale,requestId:'oversell'})));

  const event = {params:{orgId:owner,eventId:'sale_sale-one'}, data:{data:()=>({type:'sale.created',saleId:'sale-one'})}};
  await api.saleAutomation.run(event);
  await api.saleAutomation.run(event);
  assert.equal((await db.collection(`organizations/${owner}/invoices`).get()).size,1);
  assert.equal((await db.collection(`organizations/${owner}/tasks`).get()).size,1);
  const invoice = (await db.doc(`organizations/${owner}/invoices/sale-one`).get()).data();
  assert.equal(invoice.total,24000);
  assert.equal(invoice.taxStatus,'requires_tax_configuration');

  const report = await api.generateReport.run(request({useAi:false}));
  assert.equal(report.facts.salesValueMinor,24000);
  await api.grantMember.run(request({uid:'clerk',apps:['pos']}));
  await assert.rejects(api.saveRecord.run(request({appId:'hospital',record:{name:'Forbidden'}},'clerk')));
  await assert.rejects(api.installApp.run(request({appId:'hr'},'clerk')));

  // The production entrypoint now includes the interconnected SOTA control plane.
  const marketplace = await api.getProcessMarketplace.run(request({}));
  assert.equal(marketplace.templates.length, 5);
  await api.installProcessTemplate.run(request({templateId:'retail_low_stock_replenishment'}));
  assert.equal((await db.doc(`organizations/${owner}/automationRules/market_retail_low_stock_replenishment`).get()).exists, true);

  await api.saveAgentPolicy.run(request({
    agentId:'crm_agent',
    displayName:'CRM Agent',
    policy:{active:true,allowedApps:['crm'],allowedActions:['event.publish'],approvalRequiredActions:[],monthlyBudgetMinor:1000}
  }));
  const agentRequest = await api.requestAgentAction.run(request({agentId:'crm_agent',appId:'crm',action:'event.publish',estimatedCostMinor:10}));
  assert.equal(agentRequest.state, 'allowed');
  const execution = await api.executeAgentAction.run(request({
    permitId:agentRequest.permitId,
    action:'event.publish',
    payload:{type:'crm.agent_tested',payload:{contactId:'customer'}}
  }));
  assert.equal(execution.state, 'completed');
  assert.equal((await db.doc(`organizations/${owner}/agentPermits/${agentRequest.permitId}`).get()).data().state, 'consumed');

  await api.saveAiFinOpsBudget.run(request({monthlyBudgetMinor:5000,warnPercent:80}));
  await api.recordAiUsage.run(request({usage:{requestId:'provider_req_1',provider:'openai',model:'test-model',appId:'analytics',inputTokens:100,outputTokens:20,cachedTokens:0,costMinor:25}}));
  const finops = await api.getAiFinOpsSummary.run(request({}));
  assert.equal(finops.summary.requests, 1);
  assert.equal(finops.summary.costMinor, 25);

  const overview = await api.getControlPlaneOverview.run(request({}));
  assert.equal(overview.counts.agents, 1);
  assert.equal(overview.counts.aiUsage, 1);

  // JSON-first Website Builder runs through the same production Functions
  // entrypoint. Editing a single node increments a revision; publishing writes
  // a versioned public JSON snapshot consumed by generated Flutter clients.
  await api.installApp.run(request({appId:'mc14_website_builder'}));
  const publicId = `integration_site_${Date.now()}`;
  const site = await api.createWebsiteProject.run(request({projectId:'website-one',title:'Integration Website',publicId}));
  assert.equal(site.revision, 1);
  const patch = await api.patchWebsiteProject.run(request({
    projectId:'website-one',
    expectedRevision:1,
    patch:{op:'updateNode',nodeId:'hero_section',props:{title:'Edited without rebuild'}}
  }));
  assert.equal(patch.revision, 2);
  const published = await api.publishWebsiteProject.run(request({projectId:'website-one'}));
  assert.equal(published.version, 1);
  const publicSnapshot = await db.doc(`publishedWebsiteSites/${publicId}`).get();
  assert.equal(publicSnapshot.data().document.pages[0].root.children[0].props.title, 'Edited without rebuild');
  const scaffold = await api.exportWebsiteFlutterScaffold.run(request({projectId:'website-one'}));
  assert.match(scaffold.files['lib/main.dart'], /resolvePublishedWebsiteExperience/);
  assert.match(scaffold.files['lib/main.dart'], new RegExp(`const publicId = '${publicId}'`));

  const template = await api.publishWebsiteTemplate.run(request({
    projectId:'website-one',
    templateId:'integration-free-template',
    metadata:{name:'Integration Free Template',description:'Validated marketplace template',creatorName:'Integration Creator',category:'Testing',priceMinor:0,license:'free',tags:['test']}
  }));
  assert.equal(template.version, 1);
  const templateMarket = await api.getWebsiteTemplateMarketplace.run(request({}));
  assert.ok(templateMarket.templates.some(item => item.templateId === 'integration-free-template'));
  const installedTemplate = await api.installWebsiteTemplate.run(request({templateId:'integration-free-template',projectId:'website-from-template',publicId:`${publicId}_copy`}));
  assert.equal(installedTemplate.templateId, 'integration-free-template');
  assert.equal((await db.doc(`organizations/${owner}/websiteProjects/website-from-template`).get()).data().sourceTemplateId, 'integration-free-template');

  // Website Business AI is wired to the same Business Graph/Agent Control
  // Center. Inventory is projected into a live system-managed CMS collection.
  const operator = await api.ensureWebsiteBusinessAgent.run(request({}));
  assert.equal(operator.agentId, 'website_operator');
  const catalogProjection = await api.refreshWebsiteBusinessCatalog.run(request({}));
  assert.equal(catalogProjection.collectionId, 'business_products');
  const mirroredTea = (await db.doc(`organizations/${owner}/websiteCmsCollections/business_products/entries/tea`).get()).data();
  assert.equal(mirroredTea.values.name, 'Tea');
  assert.equal(mirroredTea.values.stock, 1);

  const context = await api.getWebsiteBusinessContext.run(request({projectId:'website-one'}));
  assert.equal(context.metrics.products, 1);
  assert.equal(context.metrics.unitsSold, 2);
  assert.ok(context.graph.nodes >= 0);

  // Seed a deterministic plan in the emulator so governance/execution can be
  // tested without calling an external AI provider.
  const teaBefore = (await db.doc(`organizations/${owner}/products/tea`).get()).data();
  const aiDocument = JSON.parse(JSON.stringify(publicSnapshot.data().document));
  aiDocument.title = 'AI Optimized Store';
  await db.doc(`organizations/${owner}/websiteAiPlans/integration_ai_plan`).set({
    planId:'integration_ai_plan',
    projectId:'website-one',
    sourceRevision:2,
    document:aiDocument,
    productChanges:[{
      mutationId:'feature_tea',operation:'update',productId:'tea',
      product:{featured:true},baseProductDigest:productRecordDigest('tea',teaBefore),reason:'Feature Tea'
    }],
    state:'proposed'
  });

  // Draft changes are allowed by default and still consume a governed permit.
  const websiteAction = await api.requestWebsiteBusinessAction.run(request({
    planId:'integration_ai_plan',kind:'apply_document'
  }));
  assert.equal(websiteAction.state, 'allowed');
  const resolvedWebsiteAction = await api.resolveWebsiteBusinessAction.run(request({requestId:websiteAction.requestId}));
  const applied = await api.executeAgentAction.run(request({
    permitId:resolvedWebsiteAction.permitId,
    action:resolvedWebsiteAction.action,
    payload:resolvedWebsiteAction.payload
  }));
  assert.equal(applied.state, 'completed');
  assert.equal((await db.doc(`organizations/${owner}/websiteProjects/website-one`).get()).data().revision, 3);

  // Product database changes default to human approval. The approved permit is
  // bound to the exact validated payload, so a tampered edit is rejected.
  const productAction = await api.requestWebsiteBusinessAction.run(request({
    planId:'integration_ai_plan',kind:'product',mutationId:'feature_tea'
  }));
  assert.equal(productAction.state, 'pending_approval');
  const approvedProduct = await api.approveAgentAction.run(request({requestId:productAction.requestId,approved:true}));
  assert.equal(approvedProduct.state, 'approved');
  const resolvedProduct = await api.resolveWebsiteBusinessAction.run(request({requestId:productAction.requestId}));
  await assert.rejects(api.executeAgentAction.run(request({
    permitId:resolvedProduct.permitId,
    action:resolvedProduct.action,
    payload:{...resolvedProduct.payload,record:{featured:false}}
  })), /payload does not match/);
  const productExecution = await api.executeAgentAction.run(request({
    permitId:resolvedProduct.permitId,
    action:resolvedProduct.action,
    payload:resolvedProduct.payload
  }));
  assert.equal(productExecution.state, 'completed');
  assert.equal((await db.doc(`organizations/${owner}/products/tea`).get()).data().featured, true);
  await api.refreshWebsiteBusinessCatalog.run(request({}));
  assert.equal((await db.doc(`organizations/${owner}/websiteCmsCollections/business_products/entries/tea`).get()).data().values.featured, true);

  await api.uninstallApp.run(request({appId:'pos'}));
  await api.uninstallApp.run(request({appId:'inventory'}));
  assert.equal((await db.doc(`organizations/${owner}/apps/inventory`).get()).exists, false);
});

after(async () => { await Promise.all(getApps().map(deleteApp)); });
