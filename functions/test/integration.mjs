import {test, after} from 'node:test';
import assert from 'node:assert/strict';
import {getFirestore} from 'firebase-admin/firestore';
import {getApps, deleteApp} from 'firebase-admin/app';
if (!process.env.FIRESTORE_EMULATOR_HOST || process.env.GCLOUD_PROJECT !== 'demo-tandao') throw new Error('Integration tests require the demo-tandao Firestore emulator');
const api = await import('../src/index.js');
const db = getFirestore();
const owner = `test_${Date.now()}`;
const request = (data, uid = owner) => ({data: {orgId: owner, ...data}, auth: {uid, token: {email: 'owner@example.test'}}});

test('shared workflow enforces auth, dependencies, tenant scope, stock transaction, replay handling and uninstall safety', async () => {
  await assert.rejects(api.createOrganization.run({data: {name: 'No auth'}}));
  await api.createOrganization.run(request({name: 'Integration business'}));

  await api.installApp.run(request({appId:'pos'}));
  assert.equal((await db.doc(`organizations/${owner}/apps/pos`).get()).exists, true);
  assert.equal((await db.doc(`organizations/${owner}/apps/inventory`).get()).exists, true, 'POS must provision required Inventory dependency');
  await assert.rejects(api.uninstallApp.run(request({appId:'inventory'})), /required by pos/);

  for (const appId of ['crm','accounting']) await api.installApp.run(request({appId}));
  const crm = db.doc(`organizations/${owner}/apps/crm`);
  const expiry = (await crm.get()).data().expiresAt.toMillis();
  await api.installApp.run(request({appId:'crm'}));
  assert.equal((await crm.get()).data().expiresAt.toMillis(), expiry, 'reinstall must not renew free trial');

  await assert.rejects(api.saveRecord.run(request({appId:'crm', record:{name:'Intruder'}}, 'stranger')));
  await api.saveRecord.run(request({appId:'crm', id:'customer', record:{name:'Customer'}}));
  await api.saveRecord.run(request({appId:'inventory', id:'tea', record:{name:'Tea',price:12000,stock:3}}));
  await api.installApp.run(request({appId:'marketing'}));
  await api.saveRecord.run(request({appId:'marketing', id:'campaign', record:{name:'Campaign',segment:'SMEs',channel:'WhatsApp',status:'ACTIVE'}}));
  assert.equal((await db.doc(`organizations/${owner}/marketing_campaigns/campaign`).get()).data().segment, 'SMEs');

  // Specialized screens are allowed to use their native primary fields rather
  // than being forced to invent a generic `name` field.
  await api.installApp.run(request({appId:'procurement'}));
  await api.saveRecord.run(request({appId:'procurement', id:'po-one', record:{vendor:'Acme Supplies',item:'Cement',qty:40,status:'ORDERED'}}));
  const purchase = (await db.doc(`organizations/${owner}/procurement_pos/po-one`).get()).data();
  assert.equal(purchase.vendor, 'Acme Supplies');
  assert.equal(purchase.name, 'Acme Supplies');

  // Any master-catalogue app is a real entitlement and persists through the
  // generic top-level app collection used by the shared operational runtime.
  await api.installApp.run(request({appId:'mc25_mining_operations'}));
  await api.saveRecord.run(request({
    appId:'mc25_mining_operations',
    id:'shift-one',
    record:{title:'Kendege Shift',site:'Kendege',material:'Coltan',location:'Pit A',status:'ACTIVE'}
  }));
  const mining = (await db.doc(`organizations/${owner}/mc25_mining_operations/shift-one`).get()).data();
  assert.equal(mining.site, 'Kendege');
  assert.equal(mining.material, 'Coltan');

  const sale = {requestId:'sale-one',productId:'tea',contactId:'customer',quantity:2};
  await Promise.all([api.createSale.run(request(sale)), api.createSale.run(request(sale))]);
  assert.equal((await db.doc(`organizations/${owner}/products/tea`).get()).data().stock, 1);
  await assert.rejects(api.createSale.run(request({...sale,requestId:'oversell'})));

  const event = {params:{orgId:owner,eventId:'sale_sale-one'}, data:{data:()=>({type:'sale.created',saleId:'sale-one'})}};
  await api.saleAutomation.run(event);
  await api.saleAutomation.run(event);
  assert.equal((await db.collection(`organizations/${owner}/invoices`).get()).size,1);
  assert.equal((await db.collection(`organizations/${owner}/tasks`).get()).size,1);
  const invoice = (await db.doc(`organizations/${owner}/invoices/sale-one`).get()).data();
  assert.equal(invoice.total,24000);
  assert.equal(invoice.taxStatus,'requires_tax_configuration');

  const report = await api.generateReport.run(request({useAi:false}));
  assert.equal(report.facts.salesValueMinor,24000);
  await api.grantMember.run(request({uid:'clerk',apps:['pos']}));
  await assert.rejects(api.saveRecord.run(request({appId:'hospital',record:{name:'Forbidden'}},'clerk')));
  await assert.rejects(api.installApp.run(request({appId:'hr'},'clerk')));

  await api.uninstallApp.run(request({appId:'pos'}));
  await api.uninstallApp.run(request({appId:'inventory'}));
  assert.equal((await db.doc(`organizations/${owner}/apps/inventory`).get()).exists, false);
});

after(async () => { await Promise.all(getApps().map(deleteApp)); });
