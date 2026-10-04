import {test} from 'node:test';
import assert from 'node:assert/strict';
import {compileWebsiteContent, exampleWebsiteContent, exportStaticWebsite, vettedTemplates} from '../src/website_components.js';
import {compileWebsitePlan} from '../src/website_plan_content.js';
import {addProfit, generationPrice, monthlyBundlePrice, tokenUsage, domainCostMinor} from '../src/reseller_pricing.js';
import {domainName, parseNamecheapResponse, quoteNamecheapDomain, registerNamecheapDomain} from '../src/namecheap.js';
import {validateWebsiteDocument} from '../src/website_builder_domain.js';

const pricing = {currency: 'KES', monthlyProfit: {fixedMinor: 50000, markupBps: 2000}, generationProfit: {fixedMinor: 1000, markupBps: 2500}, tokenRates: {model: 'test-model', inputPerMillionMinor: 20000, outputPerMillionMinor: 80000, cachedInputPerMillionMinor: 5000}, usdToKes: 130};

test('all vetted presets compile deterministically and export standalone escaped static pages', () => {
  for (const preset of vettedTemplates) {
    const content = exampleWebsiteContent(preset.id);
    content.content.brand = 'A & B "Studio"';
    content.content.services = Array.from({length: 6}, (_, index) => ({title: `Service ${index}`, description: 'A service description'}));
    const compiled = compileWebsiteContent(content);
    assert.deepEqual(compiled.document, validateWebsiteDocument(compiled.document));
    assert.deepEqual(compiled, compileWebsiteContent(content));
    assert.equal(compiled.document.pages.length, 2);
    const files = exportStaticWebsite(content);
    assert.match(files['index.html'], /A &amp; B &quot;Studio&quot;/);
    assert.ok(!files['index.html'].includes('<script'));
    assert.deepEqual(JSON.parse(files['content.json']), content);
    assert.ok(files['styles.css'].includes('@media'));
  }
});

test('model content rejects layout, executable markup, bindings and unsafe links', () => {
  const content = exampleWebsiteContent();
  for (const bad of [
    {...content, nodes: []}, {...content, templateId: 'invented'},
    {...content, content: {...content.content, css: 'body {}'}},
    {...content, content: {...content.content, headline: '<script>alert(1)</script>'}},
    {...content, content: {...content.content, headline: '{{secrets}}'}},
    {...content, content: {...content.content, actionUrl: 'javascript:alert(1)'}},
    {...content, content: {...content.content, actionUrl: 'https://user:password@example.com'}},
    {...content, content: {...content.content, services: []}},
  ]) assert.throws(() => compileWebsiteContent(bad));
});

test('business planner compiles content and preserves existing site for product-only plans', () => {
  const blueprint = exampleWebsiteContent('clinic'), document = compileWebsiteContent(blueprint).document;
  const plan = {summary: 'Update stock', rationale: [], contentBlueprint: null, productChanges: [{mutationId: 'stock', operation: 'update', productId: 'known', product: {stock: 10}, reason: 'Requested'}], publishRecommended: false, optimizationGoal: ''};
  assert.deepEqual(compileWebsitePlan(plan, document).document, document);
  assert.equal(compileWebsitePlan({...plan, contentBlueprint: exampleWebsiteContent('agency')}, document).contentBlueprint.templateId, 'agency');
  assert.throws(() => compileWebsitePlan({...plan, document}, document), /structured/);
});

test('monthly costs and token charges retain separate cost/profit components with exact rounding', () => {
  const monthly = monthlyBundlePrice(100000, pricing);
  assert.equal(monthly.costMinor, 100000); assert.equal(monthly.profitMinor, 70000); assert.equal(monthly.totalMinor, 170000);
  const usage = tokenUsage({promptTokenCount: 1000000, candidatesTokenCount: 100000, cachedContentTokenCount: 200000, thoughtsTokenCount: 100000});
  const charge = generationPrice(usage, pricing, 'test-model');
  assert.equal(charge.costMinor, 33000); assert.equal(charge.profitMinor, 9250); assert.equal(charge.totalMinor, 42250);
  assert.equal(generationPrice({inputTokens: 1, outputTokens: 0, cachedInputTokens: 0, thinkingTokens: 0}, pricing, 'test-model').costMinor, 1);
  assert.equal(domainCostMinor(10, 130), 130000);
  assert.throws(() => generationPrice(usage, pricing, 'wrong-model'), /model/);
  assert.throws(() => tokenUsage({promptTokenCount: 2}), /complete/);
  assert.throws(() => tokenUsage({promptTokenCount: 2, candidatesTokenCount: 1, cachedContentTokenCount: 3}), /cached/);
  assert.throws(() => addProfit(1, {fixedMinor: -1, markupBps: 0}));
  assert.throws(() => addProfit(1000000000, {fixedMinor: 1, markupBps: 0}));
});

test('Namecheap quotes use checked standard domains, registration fees and server-only fixed endpoints', async () => {
  assert.equal(domainName.parse(' EXAMPLE.COM '), 'example.com');
  for (const name of ['https://example.com', 'a.com/x', '-bad.com', 'example.com.evil.io', 'x.local']) assert.throws(() => domainName.parse(name));
  assert.throws(() => parseNamecheapResponse('<!DOCTYPE foo><ApiResponse Status="OK"/>'));
  assert.throws(() => parseNamecheapResponse('<ApiResponse Status="ERROR"/>'), /rejected/);
  const original = globalThis.fetch;
  const requests = [];
  const wrap = body => `<ApiResponse Status="OK"><CommandResponse>${body}</CommandResponse></ApiResponse>`;
  globalThis.fetch = async (url, options) => {
    assert.equal(url, 'https://api.sandbox.namecheap.com/xml.response');
    assert.equal(options.redirect, 'error');
    const body = new URLSearchParams(options.body); requests.push(body);
    const command = body.get('Command');
    const xml = command.endsWith('.check') ? '<DomainCheckResult Domain="example.com" Available="true" IsPremiumName="false" IcannFee="0.20" EapFee="0"/>' : command.endsWith('.getPricing') ? '<UserGetPricingResult><ProductType Name="DOMAIN"><ProductCategory Name="REGISTER"><Product Name="com"><Price Duration="1" DurationType="YEAR" Price="10" Currency="USD"/></Product></ProductCategory></ProductType></UserGetPricingResult>' : '<DomainCreateResult Registered="true" ChargedAmount="10.20" DomainID="123" OrderID="456"/>';
    return new Response(wrap(xml));
  };
  try {
    const config = {apiUser: 'test', apiKey: 'test-key', username: 'test', clientIp: '1.2.3.4', sandbox: true};
    const quote = await quoteNamecheapDomain(config, 'example.com');
    assert.equal(quote.amountUsd, 10.2); assert.equal(quote.sandbox, true);
    const registered = await registerNamecheapDomain(config, 'example.com', {FirstName: 'Test', LastName: 'Owner', Address1: 'Test street', City: 'Nairobi', StateProvince: 'Nairobi', PostalCode: '00100', Country: 'KE', Phone: '+254.700000000', EmailAddress: 'test@example.com'});
    assert.equal(registered.chargedUsd, 10.2);
    assert.equal(requests.at(-1).get('RegistrantEmailAddress'), 'test@example.com');
    assert.equal(requests.at(-1).get('Years'), '1');
  } finally { globalThis.fetch = original; }
});
