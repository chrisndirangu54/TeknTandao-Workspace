import test from 'node:test';
import assert from 'node:assert/strict';
import {microsoftProductFamilies,microsoftResellerChecklist,validateMicrosoftCatalogSelection} from '../src/microsoft_reseller_catalog.js';
test('Microsoft reseller onboarding covers product families without inferring eligibility',()=>{
 const names=new Set(microsoftProductFamilies.map(f=>f.id));
 for(const name of ['m365','azure','dynamics','power','security','windows365','server','education','marketplace'])
  assert.ok(names.has(name));
 assert.equal(microsoftResellerChecklist.some(s=>s.includes('Partner Center')),true);
 assert.deepEqual(validateMicrosoftCatalogSelection(['m365','azure']),['m365','azure']);
 for(const invalid of [[],['invalid'],['azure','azure']])assert.throws(()=>validateMicrosoftCatalogSelection(invalid));
});
