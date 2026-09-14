import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyWebsitePatch,
  createBlankWebsiteDocument,
  generateFlutterFirebaseScaffold,
  validateWebsiteDocument,
  validateWebsiteTemplateMetadata,
  websiteDigest,
  websiteNodeTypes
} from '../src/website_builder_domain.js';

test('blank website is a bounded valid JSON document', () => {
  const site = createBlankWebsiteDocument('Acme Africa');
  assert.equal(site.schemaVersion, 1);
  assert.equal(site.title, 'Acme Africa');
  assert.equal(site.pages.length, 1);
  assert.equal(site.pages[0].path, '/');
  assert.equal(site.pages[0].root.type, 'page');
  assert.ok(websiteNodeTypes.includes('hero'));
  assert.match(websiteDigest(site), /^[a-f0-9]{64}$/);
});

test('node patches update and insert without rebuilding the document model', () => {
  let site = createBlankWebsiteDocument('Patchable');
  site = applyWebsitePatch(site, {
    op: 'updateNode',
    nodeId: 'hero_section',
    props: {title: 'Live JSON title'},
    style: {backgroundColor: '#112233', padding: 72}
  });
  assert.equal(site.pages[0].root.children[0].props.title, 'Live JSON title');
  assert.equal(site.pages[0].root.children[0].style.padding, 72);
  site = applyWebsitePatch(site, {
    op: 'insertNode',
    parentId: 'hero_section',
    node: {
      id: 'proof_text',
      type: 'text',
      props: {text: 'Published without a Flutter rebuild'},
      children: []
    }
  });
  assert.equal(site.pages[0].root.children[0].children.at(-1).id, 'proof_text');
  site = applyWebsitePatch(site, {op: 'removeNode', nodeId: 'proof_text'});
  assert.equal(site.pages[0].root.children[0].children.some(node => node.id === 'proof_text'), false);
});

test('schema rejects arbitrary executable node types, duplicate ids and unsafe URLs', () => {
  const site = createBlankWebsiteDocument('Safe');
  const badType = structuredClone(site);
  badType.pages[0].root.children.push({id: 'evil', type: 'script', props: {text: 'alert(1)'}, children: []});
  assert.throws(() => validateWebsiteDocument(badType), /Unsupported node type/);

  const duplicate = structuredClone(site);
  duplicate.pages[0].root.children.push({id: 'hero_section', type: 'text', props: {text: 'duplicate'}, children: []});
  assert.throws(() => validateWebsiteDocument(duplicate), /Duplicate node id/);

  const unsafe = structuredClone(site);
  unsafe.pages[0].root.children.push({id: 'unsafe_button', type: 'button', props: {text: 'Run'}, action: {type: 'externalUrl', url: 'javascript:alert(1)'}, children: []});
  assert.throws(() => validateWebsiteDocument(unsafe), /Unsupported URL protocol/);
});

test('generated Flutter scaffold listens to published Firestore JSON with bundled fallback', () => {
  const site = createBlankWebsiteDocument('Live Site');
  const files = generateFlutterFirebaseScaffold('live-site', site);
  assert.ok(files['lib/main.dart'].includes("publishedWebsiteSites/live-site"));
  assert.ok(files['lib/main.dart'].includes('kBundledSiteJson'));
  assert.ok(files['assets/site.json'].includes('Live Site'));
  assert.ok(files['firebase.json'].includes('build/web'));
});

test('template metadata supports free and paid creator licenses in KES minor units', () => {
  assert.deepEqual(validateWebsiteTemplateMetadata({
    name: 'Retail Pro',
    description: 'Retail launch site',
    creatorName: 'Creator',
    category: 'Retail',
    priceMinor: 490000,
    license: 'commercial',
    tags: ['Retail', 'Africa', 'Retail']
  }), {
    name: 'Retail Pro',
    description: 'Retail launch site',
    category: 'Retail',
    creatorName: 'Creator',
    priceMinor: 490000,
    currency: 'KES',
    license: 'commercial',
    tags: ['retail', 'africa']
  });
});
