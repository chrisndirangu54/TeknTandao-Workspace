import './index.js';
import {randomUUID} from 'node:crypto';
import {FieldValue, getFirestore} from 'firebase-admin/firestore';
import {onCall, HttpsError} from 'firebase-functions/v2/https';
import {onDocumentWritten} from 'firebase-functions/v2/firestore';
import {defineSecret} from 'firebase-functions/params';
import {canAccess, catalog, identifier, textValue} from './domain.js';
import {validateAgentPolicy} from './sota_domain.js';
import {validateCmsCollection, validateCmsEntry} from './website_builder_advanced_domain.js';
import {websiteDigest} from './website_builder_domain.js';
import {
  businessContextDigest,
  businessProductCmsSchema,
  businessProductCollectionId,
  productRecordDigest,
  publicProductValues,
  summarizeBusinessGraph,
  validateWebsiteBusinessPlan,
  websiteBuilderAppId,
  websiteBusinessAgentId,
} from './website_business_ai_domain.js';

const db = getFirestore();
const region = 'europe-west1';
const geminiKey = defineSecret('GEMINI_API_KEY');
const stamp = () => FieldValue.serverTimestamp();
const orgRoot = orgId => db.doc(`organizations/${identifier(orgId)}`);

function uid(request) {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in first');
  return request.auth.uid;
}

async function authorize(request, {ownerOnly = true} = {}) {
  const user = uid(request);
  const org = orgRoot(request.data.orgId);
  const member = (await org.collection('members').doc(user).get()).data();
  if (!member || (ownerOnly && member.role !== 'owner')) throw new HttpsError('permission-denied', 'Organization access denied');
  const websiteInstall = (await org.collection('apps').doc(websiteBuilderAppId).get()).data();
  if (!canAccess(member, websiteBuilderAppId, websiteInstall)) throw new HttpsError('permission-denied', 'Website Builder subscription or permission required');
  return {org, user, member};
}

function callable(handler, secrets = []) {
  return onCall({region, secrets}, async request => {
    try { return await handler(request); }
    catch (error) {
      if (error instanceof HttpsError) throw error;
      throw new HttpsError('failed-precondition', String(error?.message || 'Website business AI failed').slice(0, 1200));
    }
  });
}

function cleanTimestamp(value) {
  if (value?.toMillis instanceof Function) return value.toMillis();
  return value ?? null;
}

function publicProduct(productId, data = {}) {
  return {
    id: productId,
    name: String(data.name || productId).slice(0, 240),
    sku: String(data.sku || '').slice(0, 120),
    description: String(data.description || '').slice(0, 1200),
    category: String(data.category || '').slice(0, 160),
    unit: String(data.unit || '').slice(0, 80),
    price: Number.isSafeInteger(data.price) ? data.price : 0,
    stock: Number.isSafeInteger(data.stock) ? data.stock : 0,
    reorderLevel: Number.isSafeInteger(data.reorderLevel) ? data.reorderLevel : 0,
    active: data.active !== false,
    featured: data.featured === true,
    websiteVisible: data.websiteVisible !== false,
    imageUrl: typeof data.imageUrl === 'string' ? data.imageUrl.slice(0, 2000) : '',
  };
}

async function collectBusinessContext(org, projectId) {
  const [projectSnapshot, productsSnapshot, nodesSnapshot, edgesSnapshot, salesSnapshot, ordersSnapshot, analyticsSnapshot] = await Promise.all([
    org.collection('websiteProjects').doc(projectId).get(),
    org.collection('products').limit(200).get(),
    org.collection('businessGraphNodes').limit(1000).get(),
    org.collection('businessGraphEdges').limit(1000).get(),
    org.collection('sales').limit(500).get(),
    org.collection('ecommerce_orders').limit(300).get(),
    org.collection('websiteAnalyticsDaily').limit(90).get(),
  ]);
  if (!projectSnapshot.exists) throw new Error('Website project not found');
  const products = productsSnapshot.docs.map(doc => publicProduct(doc.id, doc.data()));
  const productDigests = Object.fromEntries(productsSnapshot.docs.map(doc => [doc.id, productRecordDigest(doc.id, doc.data())]));
  const graph = summarizeBusinessGraph(nodesSnapshot.docs.map(doc => doc.data()), edgesSnapshot.docs.map(doc => doc.data()));
  const productPerformance = {};
  let salesRevenueMinor = 0;
  let unitsSold = 0;
  for (const doc of salesSnapshot.docs) {
    const sale = doc.data();
    const total = Number.isSafeInteger(sale.total) ? sale.total : 0;
    const quantity = Number.isSafeInteger(sale.quantity) ? sale.quantity : 0;
    salesRevenueMinor += total;
    unitsSold += quantity;
    if (sale.productId) {
      const id = String(sale.productId);
      const row = productPerformance[id] || {units: 0, revenueMinor: 0};
      row.units += quantity;
      row.revenueMinor += total;
      productPerformance[id] = row;
    }
  }
  let ecommerceRevenueMinor = 0;
  for (const doc of ordersSnapshot.docs) {
    const order = doc.data();
    ecommerceRevenueMinor += Number.isSafeInteger(order.total) ? order.total : 0;
  }
  const analytics = analyticsSnapshot.docs.map(doc => ({
    id: doc.id,
    views: Number(doc.data().views || 0),
    conversions: Number(doc.data().conversions || 0),
    formAccepted: Number(doc.data().formAccepted || 0),
    formSpam: Number(doc.data().formSpam || 0),
  })).slice(0, 90);
  const current = projectSnapshot.data();
  return {
    project: {
      projectId,
      title: current.title,
      publicId: current.publicId,
      revision: current.revision || 1,
      publishedVersion: current.publishedVersion || 0,
      status: current.status || 'draft',
      document: current.draft,
    },
    products,
    productDigests,
    productPerformance,
    graph,
    metrics: {
      products: products.length,
      activeProducts: products.filter(item => item.active).length,
      visibleProducts: products.filter(item => item.websiteVisible).length,
      lowStockProducts: products.filter(item => item.stock <= Math.max(0, item.reorderLevel)).length,
      salesRevenueMinor,
      ecommerceRevenueMinor,
      unitsSold,
      websiteViews: analytics.reduce((sum, row) => sum + row.views, 0),
      websiteConversions: analytics.reduce((sum, row) => sum + row.conversions, 0),
    },
    analytics,
  };
}

function extractGeminiJson(payload) {
  const text = payload?.candidates?.[0]?.content?.parts?.map(part => part.text || '').join('') || '';
  const stripped = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  if (!stripped) throw new Error('AI returned an empty business plan');
  return JSON.parse(stripped);
}

async function callGemini(prompt, key) {
  const model = process.env.GEMINI_MODEL;
  if (!key || !model) throw new Error('Configure GEMINI_API_KEY and GEMINI_MODEL before using the Website Business AI');
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: 'POST',
    headers: {'Content-Type': 'application/json', 'x-goog-api-key': key},
    body: JSON.stringify({
      contents: [{parts: [{text: prompt}]}],
      generationConfig: {responseMimeType: 'application/json', temperature: 0.35},
    }),
    signal: AbortSignal.timeout(45000),
  });
  if (!response.ok) throw new Error(`AI provider unavailable (${response.status})`);
  return extractGeminiJson(await response.json());
}

async function ensureBusinessProductCollection(org, user = 'system') {
  const schema = validateCmsCollection(businessProductCmsSchema);
  await org.collection('websiteCmsCollections').doc(businessProductCollectionId).set({
    ...schema,
    systemManaged: true,
    sourceApp: 'inventory',
    updatedBy: user,
    updatedAt: stamp(),
  }, {merge: true});
  return schema;
}

async function mirrorProduct(org, productId, raw, user = 'system') {
  const schema = await ensureBusinessProductCollection(org, user);
  const entryRef = org.collection('websiteCmsCollections').doc(businessProductCollectionId).collection('entries').doc(identifier(productId));
  if (!raw) {
    await entryRef.delete();
    return;
  }
  const values = validateCmsEntry(schema, publicProductValues(productId, raw));
  await entryRef.set({
    entryId: identifier(productId),
    values,
    published: raw.websiteVisible !== false && raw.active !== false,
    systemManaged: true,
    sourceRecord: `products/${identifier(productId)}`,
    updatedBy: user,
    updatedAt: stamp(),
  }, {merge: true});
}

export const ensureWebsiteBusinessAgent = callable(async request => {
  const {org, user} = await authorize(request);
  const ref = org.collection('agents').doc(websiteBusinessAgentId);
  const existing = await ref.get();
  if (existing.exists) return {agentId: websiteBusinessAgentId, created: false, agent: existing.data()};
  const policy = validateAgentPolicy({
    active: true,
    allowedApps: [websiteBuilderAppId, 'inventory'],
    allowedActions: ['website.document.apply', 'website.publish', 'record.create', 'record.update'],
    approvalRequiredActions: ['website.publish', 'record.create', 'record.update'],
    monthlyBudgetMinor: Number.isSafeInteger(request.data.monthlyBudgetMinor) ? request.data.monthlyBudgetMinor : 500000,
  }, catalog);
  const agent = {
    agentId: websiteBusinessAgentId,
    displayName: 'Website Business Operator',
    purpose: 'Build, merchandise, personalize and optimize websites from governed business data.',
    policy,
    systemAgent: true,
    updatedBy: user,
    updatedAt: stamp(),
    createdAt: stamp(),
  };
  await ref.set(agent);
  return {agentId: websiteBusinessAgentId, created: true, agent};
});

export const getWebsiteBusinessContext = callable(async request => {
  const {org} = await authorize(request);
  const projectId = identifier(request.data.projectId);
  const context = await collectBusinessContext(org, projectId);
  const {productDigests: _, ...publicContext} = context;
  return {...publicContext, contextDigest: businessContextDigest(publicContext)};
});

export const refreshWebsiteBusinessCatalog = callable(async request => {
  const {org, user} = await authorize(request);
  const products = await org.collection('products').limit(500).get();
  await ensureBusinessProductCollection(org, user);
  let mirrored = 0;
  for (const product of products.docs) {
    await mirrorProduct(org, product.id, product.data(), user);
    mirrored += 1;
  }
  return {collectionId: businessProductCollectionId, mirrored};
});

export const generateWebsiteBusinessPlan = callable(async request => {
  const {org, user} = await authorize(request);
  const projectId = identifier(request.data.projectId);
  const goal = textValue(request.data.goal, 5000);
  const context = await collectBusinessContext(org, projectId);
  const safeContext = {
    graph: context.graph,
    metrics: context.metrics,
    products: context.products,
    productPerformance: context.productPerformance,
    analytics: context.analytics,
  };
  const guide = `You are the governed Website Business Operator inside TeknTandao. Return JSON only with keys summary, rationale, document, productChanges, publishRecommended, optimizationGoal. document MUST be a complete valid TeknTandao website JSON document using schemaVersion 1 and only these node types: page,section,container,row,column,wrap,stack,heading,text,richText,image,button,icon,divider,spacer,card,grid,navbar,hero,features,pricing,testimonials,cta,footer,form. Every node needs id,type,props,style,responsive,action,children. Actions are none, navigate with path, or externalUrl with an http/https/mailto/tel URL. Never output scripts, HTML, CSS, Dart, secrets or Firebase paths. For live product grids, use props.dataCollection="${businessProductCollectionId}" and child bindings such as {{name}}, {{description}}, {{price}}, {{stock}}, {{imageUrl}}. Product changes must be an array of {mutationId,operation,productId,product,reason}; operation is create or update. Product price is ALWAYS integer KES minor units: KES 250 = 25000. Stock and reorderLevel are non-negative integers. For create, product.name is required. For update, productId must match an existing product and product contains only changed fields. Do not invent product changes unless the user's goal asks for them. Preserve the current website when the goal only concerns products. Use aggregate Business Graph context and product/sales/website analytics to make evidence-based design, merchandising and optimization decisions.`;
  const raw = await callGemini(`${guide}\n\nUser goal:\n${goal}\n\nCurrent website:\n${JSON.stringify(context.project.document)}\n\nBusiness context (no customer PII):\n${JSON.stringify(safeContext)}`, geminiKey.value());
  const validated = validateWebsiteBusinessPlan(raw);
  const productChanges = validated.productChanges.map(mutation => {
    if (mutation.operation !== 'update') return mutation;
    const baseProductDigest = context.productDigests[mutation.productId];
    if (!baseProductDigest) throw new Error(`AI tried to update unknown product ${mutation.productId}`);
    return {...mutation, baseProductDigest};
  });
  const plan = {...validated, productChanges};
  const planId = identifier(request.data.planId || `web_ai_${randomUUID()}`);
  const contextDigest = businessContextDigest(safeContext);
  await org.collection('websiteAiPlans').doc(planId).set({
    planId,
    projectId,
    goal,
    sourceRevision: context.project.revision,
    sourcePublishedVersion: context.project.publishedVersion,
    sourceDigest: websiteDigest(context.project.document),
    contextDigest,
    summary: plan.summary,
    rationale: plan.rationale,
    document: plan.document,
    productChanges: plan.productChanges,
    publishRecommended: plan.publishRecommended,
    optimizationGoal: plan.optimizationGoal,
    state: 'proposed',
    createdBy: user,
    createdAt: stamp(),
    updatedAt: stamp(),
  });
  return {planId, projectId, sourceRevision: context.project.revision, contextDigest, ...plan};
}, [geminiKey]);

export const getWebsiteBusinessPlan = callable(async request => {
  const {org} = await authorize(request);
  const planId = identifier(request.data.planId);
  const snapshot = await org.collection('websiteAiPlans').doc(planId).get();
  if (!snapshot.exists) throw new Error('Website AI plan not found');
  const plan = snapshot.data();
  return {...plan, createdAt: cleanTimestamp(plan.createdAt), updatedAt: cleanTimestamp(plan.updatedAt)};
});

export const getWebsiteBusinessAiOverview = callable(async request => {
  const {org} = await authorize(request);
  const [projects, plans, agent, approvals, audits] = await Promise.all([
    org.collection('websiteProjects').limit(100).get(),
    org.collection('websiteAiPlans').orderBy('createdAt', 'desc').limit(20).get(),
    org.collection('agents').doc(websiteBusinessAgentId).get(),
    org.collection('agentApprovals').limit(100).get(),
    org.collection('agentAudit').limit(200).get(),
  ]);
  const planRows = plans.docs.map(doc => {
    const row = doc.data();
    return {
      planId: doc.id,
      projectId: row.projectId,
      goal: row.goal,
      summary: row.summary,
      rationale: row.rationale || [],
      sourceRevision: row.sourceRevision,
      publishRecommended: row.publishRecommended === true,
      productChanges: row.productChanges || [],
      state: row.state || 'proposed',
      createdAt: cleanTimestamp(row.createdAt),
    };
  });
  const relatedApprovals = approvals.docs.map(doc => ({requestId: doc.id, ...doc.data()})).filter(row => row.agentId === websiteBusinessAgentId);
  const relatedAudits = audits.docs.map(doc => ({requestId: doc.id, ...doc.data()})).filter(row => row.agentId === websiteBusinessAgentId);
  return {
    projects: projects.docs.map(doc => ({projectId: doc.id, title: doc.data().title, revision: doc.data().revision || 1, publishedVersion: doc.data().publishedVersion || 0})),
    plans: planRows,
    agent: agent.exists ? agent.data() : null,
    approvals: relatedApprovals,
    audits: relatedAudits,
    productCollectionId: businessProductCollectionId,
  };
});

export const syncInventoryProductToWebsite = onDocumentWritten({
  document: 'organizations/{orgId}/products/{productId}',
  region,
  retry: true,
}, async event => {
  const org = orgRoot(event.params.orgId);
  const installation = await org.collection('apps').doc(websiteBuilderAppId).get();
  if (!installation.exists || installation.data().expiresAt?.toMillis?.() <= Date.now()) return;
  const after = event.data?.after;
  await mirrorProduct(org, event.params.productId, after?.exists ? after.data() : null, 'inventory_projection');
});
