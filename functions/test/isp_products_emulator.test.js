import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {initializeApp,getApps} from 'firebase-admin/app';
import {getFirestore,Timestamp} from 'firebase-admin/firestore';

const enabled=Boolean(process.env.FIRESTORE_EMULATOR_HOST);
test('ISP callable functions isolate tenants, enforce roles, and separate platform operations',
  {skip:!enabled},async()=>{
    if(!getApps().length)initializeApp({projectId:process.env.GCLOUD_PROJECT||'demo-tandao'});
    const {getIspWorkspaceOverview,listIspWorkspaceRecords,saveIspWorkspaceRecord,createIspConfigurationRecord,requestIspServiceActivation,approveIspServiceActivation,previewIspProvisioning,recordIspTelemetrySample,listIspTelemetrySamples}=await import('../src/isp_product_modes.js');
    const db=getFirestore(), suffix=randomUUID().replaceAll('-','').slice(0,16);
    const orgA='ispA_'+suffix,orgB='ispB_'+suffix,ownerA='ownerA_'+suffix,ownerB='ownerB_'+suffix;
    const outsider='intruder_'+suffix,viewer='viewer_'+suffix;
    const payload=(uid,mode,orgId,extra={},token={})=>({
      data:{mode,...(orgId?{orgId}:{}),...extra},auth:{uid,token}
    });
    const save=(uid,mode,orgId,id,token={})=>saveIspWorkspaceRecord.run(
      payload(uid,mode,orgId,{kind:'subscribers',id,
        record:{label:'Customer '+id,status:'planned'}},token));
    try{
      const expiry=Timestamp.fromMillis(Date.now()+86400000);
      for(const [orgId,owner] of [[orgA,ownerA],[orgB,ownerB]]){
        await db.doc('organizations/'+orgId+'/members/'+owner).set({role:'owner',apps:['isp']});
        await db.doc('organizations/'+orgId+'/apps/isp').set({expiresAt:expiry});
      }
      await db.doc('organizations/'+orgA+'/members/'+viewer).set({role:'member',apps:['isp']});
      await save(ownerA,'managed',orgA,'sub_one');
      await save(ownerB,'managed',orgB,'sub_one');
      await assert.rejects(save(ownerA,'managed',orgA,'sub_one'),/already exists/i);
      await assert.rejects(save(outsider,'managed',orgA,'sub_two'),/Third-party ISP workspace access required/);
      await assert.rejects(save(viewer,'managed',orgA,'sub_two'),/Third-party ISP workspace access required/);
      await assert.rejects(save(ownerA,'managed',orgB,'sub_two'),/Third-party ISP workspace access required/);
      await assert.rejects(save(ownerA,'operator',undefined,'sub_one'),/platform-admin only/);
      await save('super_'+suffix,'operator',undefined,'sub_one',{superAdmin:true});
      const a=await listIspWorkspaceRecords.run(payload(ownerA,'managed',orgA,{kind:'subscribers'}));
      const b=await listIspWorkspaceRecords.run(payload(ownerB,'managed',orgB,{kind:'subscribers'}));
      const p=await listIspWorkspaceRecords.run(payload('super_'+suffix,'operator',undefined,{kind:'subscribers'},{superAdmin:true}));
      assert.equal(a.records.length,1);
      assert.equal(b.records.length,1);
      assert.equal(p.records.length,1);
      assert.equal(a.records[0].createdBy,ownerA);
      assert.equal(b.records[0].createdBy,ownerB);
      assert.equal(p.records[0].mode,'operator');
      const readOnly=await listIspWorkspaceRecords.run(payload(viewer,'managed',orgA,{kind:'subscribers'}));
      assert.equal(readOnly.records.length,1);
      const configured=(kind,id,record)=>createIspConfigurationRecord.run(payload(ownerA,'managed',orgA,{kind,id,record}));
      await configured('sites','main',{label:'Main Hub',siteCode:'main',area:'Nairobi'});
      await configured('plans','fibre20',{label:'Fiber 20M',downloadKbps:20000,uploadKbps:10000,priceMinorKes:250000,activationMode:'pppoe',vlanId:100});
      await configured('devices','router_1',{label:'Router One',vendor:'mikrotik',model:'CCR',siteId:'main',driver:'routeros_rest',managementProfileId:'vault_edge_1'});
      await configured('subscribers','cust_1',{label:'Customer One',accountCode:'cust_1',planId:'fibre20',siteId:'main',deviceId:'router_1',accessMode:'fiber'});
      await configured('sites','remote',{label:'Remote Hub',siteCode:'remote',area:'Mombasa'});
      await assert.rejects(configured('subscribers','cust_wrong_site',{
        label:'Wrong Site Customer',accountCode:'cust_wrong_site',planId:'fibre20',
        siteId:'remote',deviceId:'router_1',accessMode:'fiber'
      }),/same ISP site/);
      await assert.rejects(createIspConfigurationRecord.run(payload(ownerB,'managed',orgB,{kind:'subscribers',id:'cust_2',
         record:{label:'Intruder',accountCode:'cust_2',planId:'fibre20',siteId:'main',accessMode:'fiber'}})),/within this ISP/);
      const activation=await requestIspServiceActivation.run(payload(ownerA,'managed',orgA,{request:{
        subscriberId:'cust_1',operation:'activate',reason:'Signed installation order',idempotencyKey:'install_one'}}));
      assert.equal(activation.executed,false);
      await assert.rejects(approveIspServiceActivation.run(payload(ownerA,'managed',orgA,{requestId:'install_one'})),/independent approver/i);
      await db.doc('organizations/'+orgA+'/members/approver_'+suffix).set({role:'admin',apps:['isp']});
      const approval=await approveIspServiceActivation.run(payload('approver_'+suffix,'managed',orgA,{requestId:'install_one'}));
      assert.equal(approval.approved,true);
      assert.equal(approval.executed,false);
      const preview=await previewIspProvisioning.run(payload(ownerA,'managed',orgA,{requestId:'install_one'}));
      assert.equal(preview.executed,false);
      assert.equal(preview.preview.command,null);
      assert.equal(preview.driver.connected,false);
      const telemetry=await recordIspTelemetrySample.run(payload(ownerA,'managed',orgA,{sample:{
        deviceId:'router_1',siteId:'main',source:'snmpv3',observedAtMs:Date.now(),
        latencyMs:12,utilizationPct:30
      }}));
      assert.equal(telemetry.verified,false);
      assert.equal((await listIspTelemetrySamples.run(payload(ownerA,'managed',orgA))).samples.length,1);
      assert.equal((await listIspTelemetrySamples.run(payload(ownerB,'managed',orgB))).samples.length,0);
      await assert.rejects(recordIspTelemetrySample.run(payload(ownerB,'managed',orgB,{sample:{
        deviceId:'router_1',siteId:'main',source:'snmpv3',observedAtMs:Date.now(),latencyMs:10
      }})),/registered at the same ISP site/);
      await assert.rejects(recordIspTelemetrySample.run(payload(viewer,'managed',orgA,{sample:{
        deviceId:'router_1',siteId:'main',source:'snmpv3',observedAtMs:Date.now(),latencyMs:10
      }})),/access required/);

      await assert.rejects(previewIspProvisioning.run(payload(ownerB,'managed',orgB,{requestId:'install_one'})),/not found/i);

      assert.equal((await db.doc('organizations/'+orgA+'/ispManagement/workspace/activationRequests/install_one').get()).data().state,'approved_not_executed');
      await assert.rejects(approveIspServiceActivation.run(payload(ownerB,'managed',orgB,{requestId:'install_one'})),/not found/i);
      await assert.rejects(getIspWorkspaceOverview.run(payload(outsider,'managed',orgA)),/access required/);
      await assert.rejects(listIspWorkspaceRecords.run(payload(ownerA,'managed',orgB,{kind:'subscribers'})),/access required/);
      await assert.rejects(listIspWorkspaceRecords.run(payload(ownerA,'operator',undefined,{kind:'subscribers'})),/platform-admin only/);
    } finally {
      await db.recursiveDelete(db.doc('organizations/'+orgA));
      await db.recursiveDelete(db.doc('organizations/'+orgB));
      await db.doc('tekntandaoIsp/operations/subscribers/sub_one').delete();
    }
  });
