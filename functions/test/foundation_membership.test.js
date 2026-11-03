import test from 'node:test';
import assert from 'node:assert/strict';
import {foundationMembershipAllows} from '../src/foundation_domain.js';
test('invited, suspended and revoked users fail closed',()=>{
  for(const status of ['invited','suspended','revoked','disabled']){
    assert.equal(foundationMembershipAllows({role:'owner',status},'write'),false);
  }
  assert.equal(foundationMembershipAllows({role:'owner',status:'active'},'write'),true);
});
