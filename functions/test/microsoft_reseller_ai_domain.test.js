import test from 'node:test';
import assert from 'node:assert/strict';
import {draftMicrosoftResellerAdvice} from '../src/microsoft_reseller_ai_domain.js';
test('Microsoft advisor maps needs without fabricating prices or provisioning',()=>{
 const result=draftMicrosoftResellerAdvice({seats:120,needs:['email','security','crm','cloud','analytics']});
 assert.deepEqual(result.recommendations.map(x=>x.id),['m365','azure','dynamics','power','security']);
 assert.equal(result.quote.total,null);
 assert.equal(result.canProvision,false);
 assert.equal(result.canPurchase,false);
 assert.equal(result.requiresHumanReview,true);
 assert.equal(result.recommendations.every(x=>x.eligibility==='not_verified'),true);
});
test('Microsoft advisor rejects unsafe and malformed requirements',()=>{
 for(const requirements of [{seats:-1,needs:['cloud']},{seats:5,needs:['unknown']},
 {seats:3,needs:[]},{seats:5,needs:['crm','crm']},{seats:0,needs:['email']}])
 assert.throws(()=>draftMicrosoftResellerAdvice(requirements));
});
