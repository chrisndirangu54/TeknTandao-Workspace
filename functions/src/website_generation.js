import {FieldValue} from 'firebase-admin/firestore';
import {randomUUID} from 'node:crypto';
import {compileWebsiteContent, websiteContentGuide, websiteContentJsonSchema} from './website_components.js';
import {generationPrice, tokenUsage} from './reseller_pricing.js';
import {providerJson} from './automation_connectors.js';

// One content-only contract for every model and every website generation path.
export async function generateVettedWebsite({org, user, prompt, key, model}) {
  if (!key || !model) throw new Error('Configure GEMINI_API_KEY and GEMINI_MODEL before generating a site');
  await consumeWebsiteGenerationQuota(org);
  const pricingSnapshot = await org.collection('resellerSettings').doc('pricing').get();
  const pricing = pricingSnapshot.data()?.policy;
  if (pricing && pricing.tokenRates.model !== model) throw new Error('Token pricing does not match GEMINI_MODEL');
  const payload = await providerJson(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: 'POST', headers: {'Content-Type': 'application/json', 'x-goog-api-key': key},
    body: JSON.stringify({systemInstruction: {parts: [{text: websiteContentGuide}]}, contents: [{parts: [{text: prompt}]}], generationConfig: {responseMimeType: 'application/json', responseJsonSchema: websiteContentJsonSchema, temperature: 0.2, maxOutputTokens: 4096}}),
  }, 45000);
  const {generationId, usage, charge} = await recordGenerationUsage({org, user, model, payload, pricing});
  const record = org.collection('siteGenerationUsage').doc(generationId);
  try {
    const encoded = payload.candidates?.[0]?.content?.parts?.map(part => part.text || '').join('');
    const compiled = compileWebsiteContent(JSON.parse(encoded || '{}'));
    await record.update({status: 'validated', templateId: compiled.blueprint.templateId, blueprint: compiled.blueprint});
    return {...compiled, generationId, usage, charge, pricingPending: charge == null};
  } catch (error) {
    await record.update({status: 'invalid_content', billable: false});
    throw new Error('The model returned invalid content. No site was applied; generation usage is recorded for review.');
  }
}

export async function consumeWebsiteGenerationQuota(org) {
  const ref = org.collection('siteGenerationQuotas').doc(new Date().toISOString().slice(0, 10));
  await org.firestore.runTransaction(async tx => {
    const count = (await tx.get(ref)).data()?.count || 0;
    if (count >= 30) throw new Error('Daily website generation limit reached');
    tx.set(ref, {count: count + 1});
  });
}

export async function recordGenerationUsage({org, user, model, payload, pricing}) {
  pricing ??= (await org.collection('resellerSettings').doc('pricing').get()).data()?.policy;
  const generationId = randomUUID();
  let usage = null, charge = null;
  try {
    usage = tokenUsage(payload.usageMetadata);
    if (pricing) charge = generationPrice(usage, pricing, model);
  } catch { /* Missing usage is recorded as unpriced, never silently billed. */ }
  const record = org.collection('siteGenerationUsage').doc(generationId);
  await record.set({model, usage, charge, status: 'received', createdBy: user, createdAt: FieldValue.serverTimestamp(), pricingPending: charge == null});
  return {generationId, usage, charge};
}
