// Read-only Azure Monitor metrics via a pre-authorized OAuth token.
// Run only in a controlled environment. Never expose AZURE_ACCESS_TOKEN to a client.
import {assessCloudSignals} from '../../functions/src/cloud_planning_domain.js';
const resource=process.env.AZURE_RESOURCE_ID,token=process.env.AZURE_ACCESS_TOKEN;
if(!resource||!token){console.error('Set AZURE_RESOURCE_ID and AZURE_ACCESS_TOKEN');process.exitCode=2;}
else {
 const url='https://management.azure.com'+resource+'/providers/microsoft.insights/metrics?api-version=2018-01-01&metricnames=CpuUsage&timespan=PT1H';
 const response=await fetch(url,{headers:{Authorization:'Bearer '+token}});
 if(!response.ok)throw Error('Azure Monitor API rejected the request: '+response.status);
 const body=await response.json();
 const values=body.value?.flatMap(x=>x.timeseries||[]).flatMap(x=>x.data||[]).map(x=>x.average).filter(Number.isFinite)||[];
 const value=values.length?values.reduce((a,b)=>a+b,0)/values.length:null;
 const result=value===null?{status:'no-data'}:assessCloudSignals([{metric:'cpuPercent',value}])[0];
 console.log(JSON.stringify({resourceId:resource,status:result},null,2));
}
