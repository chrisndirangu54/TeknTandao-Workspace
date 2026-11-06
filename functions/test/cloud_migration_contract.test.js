import test from "node:test";
import assert from "node:assert/strict";
import { validateCloudMigrationRequest, proposeCloudAutomationSteps } from "../src/cloud_migration_contract.js";
const sample = {schemaVersion:1,kind:"cloud-automation-migration-request",source:"tekntandao-html",
 mode:"planning-only",appName:"Demo",repositoryUrl:"https://github.com/example/app",
 stack:"React",provider:"Azure",monthlyBudgetUsd:40};
test("valid HTML request is mapped to a pending verification record",()=>{
 const result=validateCloudMigrationRequest(sample);
 assert.equal(result.status,"awaiting-organization-verification");
 assert.equal(result.monthlyBudgetUsd,40);
 assert.equal(Object.hasOwn(result,"kind"),false);
});
test("rejects unauthorized formats and unsafe URLs",()=>{
 assert.throws(()=>validateCloudMigrationRequest({...sample,mode:"deploy"}));
 assert.throws(()=>validateCloudMigrationRequest({...sample,repositoryUrl:"javascript:alert(1)"}));
 assert.throws(()=>validateCloudMigrationRequest({...sample,monthlyBudgetUsd:-1}));
});
test("planning never executes and requires approvals",()=>{
 const steps=proposeCloudAutomationSteps(sample);
 assert.equal(steps.length,6);
 assert.equal(steps.find(x=>x.action==="provision-infrastructure").approval,"explicit-customer-and-operator-approval");
});
