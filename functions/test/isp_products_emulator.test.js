import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {initializeApp,getApps} from 'firebase-admin/app';
import {getFirestore,Timestamp} from 'firebase-admin/firestore';

const enabled=Boolean(process.env.FIRESTORE_EMULATOR_HOST);
test('ISP callable functions isolate tenants, enforce roles, and separate platform operations',
  {skip:!enabled},async()=>{
    if(!getApps().length)initializeApp({projectId:process.env.GCLOUD_PROJECT||'demo-tandao'});
    const {getIspWorkspaceOverview,listIspWorkspaceRecords,saveIspWorkspaceRecord}=await import('../src/isp_product_modes.js');
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
      await assert.rejects(getIspWorkspaceOverview.run(payload(outsider,'managed',orgA)),/access required/);
      await assert.rejects(listIspWorkspaceRecords.run(payload(ownerA,'managed',orgB,{kind:'subscribers'})),/access required/);
      await assert.rejects(listIspWorkspaceRecords.run(payload(ownerA,'operator',undefined,{kind:'subscribers'})),/platform-admin only/);
    } finally {
      await db.recursiveDelete(db.doc('organizations/'+orgA));
      await db.recursiveDelete(db.doc('organizations/'+orgB));
      await db.doc('tekntandaoIsp/operations/subscribers/sub_one').delete();
    }
  });
