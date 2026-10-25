import test from 'node:test';
import assert from 'node:assert/strict';
import {maintenanceTicket,transitionMaintenance} from '../src/property_maintenance_domain.js';
test('maintenance ticket enforces property, title and priority',()=>{
 assert.equal(maintenanceTicket({propertyId:'unit1',title:'Broken tap',priority:'high'}).status,'open');
 assert.throws(()=>maintenanceTicket({propertyId:'unit1',title:'',priority:'high'}),/title/);
 assert.throws(()=>maintenanceTicket({propertyId:'unit1',title:'Tap',priority:'urgent'}),/priority/);
});
test('maintenance cannot skip required work or close unresolved complaints',()=>{
 assert.throws(()=>transitionMaintenance({status:'open'},'closed'),/transition/);
 assert.throws(()=>transitionMaintenance({status:'assigned',assigneeId:'tech1'},'resolved',{note:'fixed'}),/transition/);
 assert.equal(transitionMaintenance({status:'open'},'assigned',{assigneeId:'tech1'}).assigneeId,'tech1');
 assert.throws(()=>transitionMaintenance({status:'in_progress',assigneeId:'tech1'},'resolved'),/Resolution note/);
 assert.equal(transitionMaintenance({status:'in_progress',assigneeId:'tech1'},'resolved',{note:'Valve replaced'}).status,'resolved');
 assert.throws(()=>transitionMaintenance({status:'closed'},'in_progress'),/transition/);
});
