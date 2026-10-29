// Adapted from HTML/cloud-automation.html (feature/cloud-automation-migration-20261024).
// Pure planner: no cloud API, IaC execution or procurement side effects.
const stacks=['Flutter web','React','Node.js','Python FastAPI','Docker container'];
const providers=['Azure','AWS','Google Cloud','Private infrastructure'];
const safeText=(x,max)=>typeof x==='string'&&x.trim().length>0&&x.trim().length<=max;
export function normalizeCloudPlan(raw){
 if(!raw||raw.schemaVersion!==1||raw.kind!=='cloud-automation-migration-request'||
 !safeText(raw.appName,120)||!stacks.includes(raw.stack)||!providers.includes(raw.provider)||
 !Number.isFinite(raw.monthlyBudgetUsd)||raw.monthlyBudgetUsd<1||raw.monthlyBudgetUsd>100000)
 throw new Error('Invalid cloud automation migration plan');
 const repositoryUrl=raw.repositoryUrl||'';
 if(typeof repositoryUrl!=='string'||repositoryUrl.length>250||
 (repositoryUrl&&!/^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/?$/.test(repositoryUrl)))
 throw new Error('Only a standard GitHub repository HTTPS URL is allowed');
 if(raw.mode!=='planning-only'||raw.source!=='tekntandao-html')
 throw new Error('Only original non-executing HTML migration plans can be imported');
 return {schemaVersion:1,kind:'cloud-automation-migration-request',
 appName:raw.appName.trim(),repositoryUrl,stack:raw.stack,provider:raw.provider,
 monthlyBudgetUsd:raw.monthlyBudgetUsd,mode:'planning-only',source:'tekntandao-html',
 executionState:'not_connected',approvedForDeployment:false};
}
export function draftCloudPlan(raw){
 const plan=normalizeCloudPlan(raw);
 return {plan,checklist:[
 'Authenticate customer and verify organization ownership.',
 'Inspect repository with customer-authorized read-only access.',
 'Generate infrastructure-as-code and an estimate; customer approves.',
 'Apply deployment via audited CI/CD under restricted credentials.',
 'Enable monitoring, backups, alerts and controlled maintenance.',
 'Escalate destructive changes and unexpected costs.'
 ],budgetNote:'Requested monthly budget is not an enforced cloud-spend limit',
 executed:false};
}
