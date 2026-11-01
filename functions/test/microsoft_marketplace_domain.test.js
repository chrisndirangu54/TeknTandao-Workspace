import test from 'node:test';
import assert from 'node:assert/strict';
import {
 resellerSlug,purchaseIntentId,validatePurchaseIntent,verifiedManualQuote,
 recommendMicrosoftProducts,canAcceptQuote,automationSteps
} from '../src/microsoft_marketplace_domain.js';

const selection={families:['m365','azure'],seats:12,needs:['collaboration','cloud'],note:'New workspace',customerConfirmed:true};

test('reseller SaaS store URL is bounded and cannot contain path injection',()=>{
 assert.equal(resellerSlug('sample-cloud-reseller'),'sample-cloud-reseller');
 for(const input of ['../admin','a','a--','ABC','a b','microsoft.com','<script>',null]){
  assert.throws(()=>resellerSlug(input));
 }
});

test('quote submissions require explicit customer authorization and valid seat counts',()=>{
 const out=validatePurchaseIntent(selection);
 assert.equal(out.seats,12);
 assert.equal(out.advice.quote.total,null);
 assert.equal(out.advice.canPurchase,false);
 assert.deepEqual(out.advice.recommendations.map(v=>v.id),['m365','azure']);
 for(const invalid of [{...selection,customerConfirmed:false},{...selection,seats:0},
  {...selection,seats:999999},{...selection,needs:[]},
  {...selection,families:['m365','m365']},{...selection,note:'x'.repeat(1201)}]){
  assert.throws(()=>validatePurchaseIntent(invalid));
 }
});

test('client-provided idempotency key is unique per buyer tenant',()=>{
 const a=purchaseIntentId('buyer-one','external-12345678');
 assert.equal(a,purchaseIntentId('buyer-one','external-12345678'));
 assert.notEqual(a,purchaseIntentId('buyer-two','external-12345678'));
 assert.notEqual(a,purchaseIntentId('buyer-one','external-87654321'));
 assert.throws(()=>purchaseIntentId('../owner','external-12345678'));
 assert.throws(()=>purchaseIntentId('buyer-one','../../foo'));
});

test('unverified prices or missing SKU/supplier references never issue a quote',()=>{
 const verified={currency:'KES',unitPriceMinor:130000,sku:'Business-Standard-Eligible',supplierEvidence:'Provider quotation 2026-11-01',validDays:7,commercialVerification:true};
 const q=verifiedManualQuote(verified,12);
 assert.equal(q.totalMinor,1560000);
 assert.equal(q.paid,false);assert.equal(q.providerOrderPlaced,false);
 for(const item of [{...verified,commercialVerification:false},{...verified,unitPriceMinor:0},
  {...verified,currency:'USD'},{...verified,sku:''},{...verified,supplierEvidence:''},
  {...verified,validDays:365}]){
  assert.throws(()=>verifiedManualQuote(item,12));
 }
});
test('only valid, current, operator-verified quotes can be accepted',()=>{
 const now=1700000000000;
 const valid={status:'quote_ready',quote:{verifiedByOperator:true,expiresAtMs:now+5000,paid:false,providerOrderPlaced:false}};
 assert.equal(canAcceptQuote(valid,now),true);
 assert.equal(canAcceptQuote({...valid,status:'quote_requested'},now),false);
 assert.equal(canAcceptQuote({...valid,quote:{...valid.quote,expiresAtMs:now-1}},now),false);
 assert.equal(canAcceptQuote({...valid,quote:{...valid.quote,verifiedByOperator:false}},now),false);
 assert.equal(canAcceptQuote({...valid,quote:{...valid.quote,paid:true}},now),false);
});
test('AI advice is recommendation-only, with necessary provider and customer checks',()=>{
 const r=recommendMicrosoftProducts({seats:15,needs:['security','email']});
 assert.equal(r.externalOrderPlaced,false);
 assert.equal(r.authorizationChecked,false);
 assert.equal(r.canProvision,false);
 assert.equal(r.quote.total,null);
 assert.ok(r.checklist.some(step=>step.includes('Customer Agreement')));
 assert.ok(automationSteps('customer_accepted_pending_partner_order').some(step=>step.includes('reseller relationship')));
});
