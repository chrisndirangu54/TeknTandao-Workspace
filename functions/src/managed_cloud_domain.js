import {createHash,timingSafeEqual} from 'node:crypto';
import {z} from 'zod';
const githubRepo=/^https:\/\/github\.com\/([a-zA-Z0-9-]{1,39})\/([a-zA-Z0-9_.-]{1,100})(?:\.git)?\/?$/;
export const managedCloudProviders={
  gcp_cloud_run:{name:'Google Cloud Run',deployment:'github_oidc',supported:true},
  aws_apprunner:{name:'AWS App Runner',deployment:'github_oidc_ecr',supported:true},
  azure_container_apps:{name:'Azure Container Apps',deployment:'github_oidc',supported:true},
  digitalocean_app_platform:{name:'DigitalOcean App Platform',deployment:'token_scoped',supported:true},
  cloudflare_pages:{name:'Cloudflare Pages',deployment:'token_scoped',supported:true},
  railway:{name:'Railway',deployment:'token_scoped',supported:true},
  render:{name:'Render',deployment:'deploy_hook_or_api',supported:true}
};
export const cloudPlanCatalog=Object.freeze({
  starter:{priceKes:1500,periodDays:30,description:'Managed deployment control plane Starter'},
  growth:{priceKes:5000,periodDays:30,description:'Managed deployment control plane Growth'},
  business:{priceKes:15000,periodDays:30,description:'Managed deployment control plane Business'}
});
export const serviceSchema=z.object({
 cloudProvider:z.enum(Object.keys(managedCloudProviders)),
 name:z.string().trim().min(3).max(70).regex(/^[A-Za-z0-9][a-zA-Z0-9 -]*$/),
 repository:z.string().max(260).refine(v=>githubRepo.test(v),'Provide a GitHub repository HTTPS URL'),
 branch:z.string().min(1).max(120).regex(/^[A-Za-z0-9][A-Za-z0-9._/-]*$/)
   .refine(v=>!v.includes('..')&&!v.endsWith('/')&&!v.endsWith('.lock')&&!v.includes('//')),
 cloudRegion:z.enum(['europe-west1','europe-west4','us-central1','asia-south1']),
 serviceName:z.string().regex(/^[a-z][a-z0-9-]{2,48}$/),
 monthlyBudgetUsd:z.number().positive().max(100000),
 autoDeploy:z.boolean().default(false),
 customerConsent:z.literal(true),
}).strict();
export function normalizedRepository(value) {
 const match=githubRepo.exec(value);
 if(!match)throw new Error('Invalid GitHub repository URL');
 return {owner:match[1],repo:match[2].replace(/\.git$/,''),
  canonical:`https://github.com/${match[1]}/${match[2].replace(/\.git$/,'')}`};
}
export function hashIngestionToken(token){return createHash('sha256').update(token).digest('hex');}
export function verifyIngestionToken(token,digest){
 if(typeof token!=='string'||token.length!==64||! /^[a-f0-9]{64}$/.test(digest||''))return false;
 const actual=Buffer.from(hashIngestionToken(token),'hex');
 return timingSafeEqual(actual,Buffer.from(digest,'hex'));
}
export const runSignalSchema=z.object({
 runId:z.string().regex(/^[0-9]{1,20}$/),
 sha:z.string().regex(/^[a-f0-9]{40}$/),
 branch:z.string().min(1).max(120),
 status:z.enum(['success','failure','cancelled']),
 commitTime:z.string().datetime({offset:true}).optional(),
 durationSec:z.number().int().min(0).max(86400).optional(),
 serviceUrl:z.string().url().max(1000).refine(v=>v.startsWith('https://')).optional(),
 cpuPercent:z.number().finite().min(0).max(100).optional(),
 memoryPercent:z.number().finite().min(0).max(100).optional(),
 errorRatePercent:z.number().finite().min(0).max(100).optional(),
 p95LatencyMs:z.number().finite().min(0).max(300000).optional(),
 estimatedMonthlyUsd:z.number().finite().min(0).max(1000000).optional(),
}).strict();
export function computeCloudInsights(runs=[],budgetUsd=100){
 const latest=[...runs].slice(0,30);
 const completed=latest.filter(r=>r.status==='success'||r.status==='failure');
 const failures=completed.filter(r=>r.status==='failure').length;
 const failureRate=completed.length?failures/completed.length:0;
 const durations=completed.map(r=>r.durationSec).filter(Number.isFinite);
 const avgDurationSec=durations.length?Math.round(durations.reduce((a,b)=>a+b,0)/durations.length):null;
 const first=latest.find(r=>r.status==='success')||latest[0]||{};
 const alerts=[];
 if(completed.length>=3&&failureRate>0.2)alerts.push({severity:'high',code:'deploy_failures',message:'Deployment failure rate exceeds 20% over recent completed runs.'});
 if(first.errorRatePercent>2)alerts.push({severity:'high',code:'error_rate',message:'Reported application error rate exceeds 2%; inspect request and exception telemetry.'});
 if(first.cpuPercent>=85)alerts.push({severity:'medium',code:'cpu',message:'Reported CPU usage is elevated; inspect sustained utilisation and instance scaling.'});
 if(first.memoryPercent>=90)alerts.push({severity:'high',code:'memory',message:'Reported memory usage is high; check leaks and instance sizing.'});
 if(first.p95LatencyMs>1500)alerts.push({severity:'medium',code:'latency',message:'Reported p95 latency is above 1.5 seconds.'});
 if(first.estimatedMonthlyUsd>budgetUsd)alerts.push({severity:'high',code:'budget',message:'Estimated monthly cloud spend exceeds the configured budget.'});
 return {provenance:'rule_based_on_reported_ci_and_telemetry',runs:completed.length,
  failureRatePercent:Math.round(failureRate*1000)/10,avgDurationSec,
  latestStatus:first.status||'not_reported',alerts,confidence:completed.length>=5?'medium':'limited',
  notice:'CI-supplied metrics are self-reported, not independently measured. No remediation was performed.'};
}
