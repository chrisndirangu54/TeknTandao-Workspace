import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assignExperimentVariant,
  cloudflareDnsRecord,
  hashVisitor,
  interpolateBindings,
  mergeWebsiteCrdtOps,
  normalizeWebsiteDomain,
  publicCmsEntry,
  replayWebsiteCrdtOps,
  scoreFormSpam,
  signAnalyticsToken,
  validateAssetUploadRequest,
  validateCmsCollection,
  validateCmsEntry,
  validatePayoutProfile,
  validatePluginManifest,
  validatePluginResponse,
  validateWebsiteExperiment,
  verifyAnalyticsToken
} from '../src/website_builder_advanced_domain.js';
import {createBlankWebsiteDocument} from '../src/website_builder_domain.js';

test('custom domains and Firebase DNS records normalize safely', () => {
  assert.equal(normalizeWebsiteDomain('HTTPS://Shop.Example.COM/'), 'shop.example.com');
  assert.throws(() => normalizeWebsiteDomain('localhost'));
  assert.deepEqual(
    cloudflareDnsRecord({domainName:'shop.example.com.',type:'CNAME',rdata:'example.web.app.',requiredAction:'ADD'}),
    {type:'CNAME',name:'shop.example.com',content:'example.web.app',ttl:1,proxied:false,requiredAction:'ADD'}
  );
});

test('asset requests reject active content and enforce size bounds', () => {
  const asset = validateAssetUploadRequest({projectId:'site',name:'hero.webp',contentType:'image/webp',size:1024});
  assert.equal(asset.contentType, 'image/webp');
  assert.throws(() => validateAssetUploadRequest({projectId:'site',name:'x.svg',contentType:'image/svg+xml',size:100}));
});

test('CMS schema validates typed entries and strips private public fields', () => {
  const schema = validateCmsCollection({
    collectionId:'posts', name:'Posts', publicRead:true, slugField:'slug',
    fields:[
      {id:'slug',label:'Slug',type:'text',required:true,public:true},
      {id:'title',label:'Title',type:'text',required:true,public:true},
      {id:'internalNotes',label:'Internal notes',type:'longText',public:false},
      {id:'views',label:'Views',type:'number',public:true}
    ]
  });
  const entry = validateCmsEntry(schema,{slug:'hello',title:'Hello',internalNotes:'secret',views:4});
  assert.equal(entry.views, 4);
  assert.deepEqual(publicCmsEntry(schema, entry), {slug:'hello',title:'Hello',views:4});
  assert.equal(interpolateBindings('Read {{title}} · {{views}} views', entry), 'Read Hello · 4 views');
});

test('plugins are arbitrary remote publishers but only through declared capabilities and validated JSON', () => {
  const manifest = validatePluginManifest({
    pluginId:'maps_plus', name:'Maps Plus', publisher:'Acme', endpoint:'https://plugins.example.com/runtime',
    capabilities:['site.fragment','site.data'], publicRuntime:true, version:'2.0.0'
  });
  assert.equal(manifest.publicRuntime, true);
  assert.throws(() => validatePluginManifest({...manifest, endpoint:'http://plugins.example.com/runtime'}));
  const response = validatePluginResponse({kind:'fragment',fragment:{id:'map_fragment',type:'container',props:{title:'Map'},children:[]}});
  assert.equal(response.fragment.id, 'map_fragment');
  assert.throws(() => validatePluginResponse({kind:'fragment',fragment:{id:'evil',type:'script',props:{code:'alert(1)'},children:[]}}));
});

test('experiments assign deterministically and analytics tokens cannot be forged', () => {
  const experiment = validateWebsiteExperiment({
    experimentId:'hero_test', name:'Hero test', projectId:'site', status:'active', path:'/', trafficBps:10000,
    variants:[{id:'a',version:1,weight:5000},{id:'b',version:2,weight:5000}], goals:['cta_click']
  });
  assert.deepEqual(assignExperimentVariant(experiment,'visitor-one'), assignExperimentVariant(experiment,'visitor-one'));
  const secret = 'test-secret';
  const visitorHash = hashVisitor(secret,'visitor-one');
  const token = signAnalyticsToken(secret,{publicId:'site',orgId:'org',projectId:'site',goals:['cta_click'],visitorHash,exp:Date.now()+60000});
  assert.equal(verifyAnalyticsToken(secret,token).visitorHash, visitorHash);
  assert.throws(() => verifyAnalyticsToken('wrong-secret',token));
});

test('spam scoring catches honeypots and link floods', () => {
  assert.equal(scoreFormSpam({name:'Normal person',message:'Hello'}, {elapsedMs:5000}), 0);
  assert.ok(scoreFormSpam({message:'https://a.test https://b.test https://c.test'}, {honeypot:'bot'}) >= 50);
});

test('payout profiles support Kenya Paystack recipient rails', () => {
  const mobile = validatePayoutProfile({type:'mobile_money',currency:'KES',name:'Creator',accountNumber:'254700000000',bankCode:'MPESA',minPayoutMinor:50000});
  assert.equal(mobile.currency, 'KES');
  assert.throws(() => validatePayoutProfile({...mobile,currency:'USD'}));
});

test('operation-set CRDT converges regardless of replica merge order', () => {
  const base = createBlankWebsiteDocument('CRDT Site');
  const left = [{actorId:'alice',opId:'alice_1',clock:1,epoch:1,patch:{op:'updateNode',nodeId:'hero_section',props:{title:'Alice title'}}}];
  const right = [{actorId:'bob',opId:'bob_1',clock:1,epoch:1,patch:{op:'updateNode',nodeId:'hero_section',props:{subtitle:'Bob subtitle'}}}];
  const mergedAB = mergeWebsiteCrdtOps(left,right);
  const mergedBA = mergeWebsiteCrdtOps(right,left);
  assert.deepEqual(mergedAB, mergedBA);
  const a = replayWebsiteCrdtOps(base, mergedAB).document;
  const b = replayWebsiteCrdtOps(base, mergedBA).document;
  assert.deepEqual(a,b);
  const hero = a.pages[0].root.children[0];
  assert.equal(hero.props.title,'Alice title');
  assert.equal(hero.props.subtitle,'Bob subtitle');
});
