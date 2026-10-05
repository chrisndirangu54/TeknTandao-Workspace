import './index.js';
import {randomUUID} from 'node:crypto';
import {getApp} from 'firebase-admin/app';
import {FieldValue, Timestamp, getFirestore} from 'firebase-admin/firestore';
import {getStorage} from 'firebase-admin/storage';
import {defineSecret} from 'firebase-functions/params';
import {HttpsError, onCall} from 'firebase-functions/v2/https';
import {onSchedule} from 'firebase-functions/v2/scheduler';
import {z} from 'zod';
import {automationId, decryptCredential, encryptCredential} from './automation_domain.js';
import {providerJson} from './automation_connectors.js';
import {loadExecutiveFacts, deterministicRecommendations} from './executive_intelligence.js';
import {buildCsv, buildDocx, buildPdf, buildPptx, buildXlsx} from './office_export_formats.js';

const db=getFirestore();
const region='europe-west1';
const encryptionKey=defineSecret('AUTOMATION_ENCRYPTION_KEY');
const oauthConfig=defineSecret('AUTOMATION_OAUTH_CONFIG');
const stamp=()=>FieldValue.serverTimestamp();
const orgRoot=id=>db.doc('organizations/'+automationId.parse(id));
const credentials=(org,id)=>db.doc('workspaceAutomationSecrets/'+org.id+'/connections/'+automationId.parse(id));

async function authorize(request,{ownerOnly=false}={}){
  if(!request.auth)throw new HttpsError('unauthenticated','Sign in first');
  const org=orgRoot(request.data?.orgId);
  const member=(await org.collection('members').doc(request.auth.uid).get()).data();
  if(!member||(ownerOnly&&member.role!=='owner'))throw new HttpsError('permission-denied',ownerOnly?'Workspace owner access required':'Workspace access denied');
  return {org,user:request.auth.uid,member};
}
function callable(handler,secrets=[]){
  return onCall({region,secrets,timeoutSeconds:180,memory:'1GiB'},async request=>{
    try{return await handler(request);}
    catch(error){
      if(error instanceof HttpsError)throw error;
      throw new HttpsError('failed-precondition',String(error?.message||'Export failed').slice(0,1000));
    }
  });
}
function bucket(){
  const name=process.env.REPORT_EXPORT_BUCKET||getApp().options.storageBucket;
  if(!name)throw new Error('Configure REPORT_EXPORT_BUCKET or Firebase storageBucket');
  return getStorage().bucket(name);
}
function mimeFor(format){
  return ({
    csv:'text/csv',
    xlsx:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    pptx:'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    pdf:'application/pdf',
  })[format];
}
function cleanFilename(name){
  return String(name||'TeknTandao Executive Intelligence').replace(/[<>:"/\\|?*\u0000-\u001F]/g,' ').replace(/\s+/g,' ').trim().slice(0,120)||'TeknTandao Export';
}
function flattenFacts(facts){
  return [
    {metric:'Recorded sales records',value:facts.sales.count,detail:'Bounded records'},
    {metric:'Recorded sales value (minor units)',value:facts.sales.valueMinor,detail:'Recorded sales, not collected cash'},
    {metric:'Current month sales (minor units)',value:facts.sales.currentMonthMinor,detail:'Bounded monthly series'},
    {metric:'Inventory SKUs',value:facts.inventory.skuCount,detail:'Products sampled'},
    {metric:'Inventory units',value:facts.inventory.units,detail:'Stored stock units'},
    {metric:'Low-stock SKUs',value:facts.inventory.lowStock,detail:'Stock <= 5'},
    {metric:'Out-of-stock SKUs',value:facts.inventory.outOfStock,detail:'Stock <= 0'},
    {metric:'CRM contacts',value:facts.customers.contacts,detail:'Bounded contacts'},
    {metric:'Open support tickets',value:facts.support.open,detail:'Not resolved/closed'},
    {metric:'High-priority open tickets',value:facts.support.highPriorityOpen,detail:'High/urgent/critical/P1'},
    {metric:'Projects',value:facts.projects.total,detail:'Bounded project records'},
    {metric:'Overdue projects',value:facts.projects.overdue,detail:'Past due and not complete'},
    {metric:'Connected systems',value:facts.connectors.connected,detail:'Connected integrations'},
    {metric:'Healthy connectors',value:facts.connectors.healthy,detail:'Most recent health probe'},
    {metric:'Degraded connectors',value:facts.connectors.degraded,detail:'Most recent health probe'},
    {metric:'Sync conflicts',value:facts.connectors.conflicts,detail:'Recent Data Exchange conflicts'},
    {metric:'Installed apps',value:facts.apps.installed,detail:'Workspace apps'},
  ];
}
function reportData(facts){
  const recommendations=deterministicRecommendations(facts);
  const kpis=flattenFacts(facts);
  const salesTrend=(facts.sales.series||[]).map(row=>({period:row.period,valueMinor:row.value,count:row.count}));
  const inventoryHealth=(facts.inventory.stockHealth||[]).map(row=>({status:row.label,count:row.value}));
  const supportStatus=(facts.support.status||[]).map(row=>({status:row.label,count:row.value}));
  const connectorProviders=(facts.connectors.providers||[]).map(row=>({provider:row.label,count:row.value}));
  const recRows=recommendations.map(item=>({priority:item.priority,title:item.title,reason:item.reason,action:item.action,source:item.source}));
  return {kpis,salesTrend,inventoryHealth,supportStatus,connectorProviders,recommendations:recRows};
}
function sectionsFrom(data){
  return [
    {heading:'Executive KPIs',lines:data.kpis.map(row=>row.metric+': '+row.value+' — '+row.detail)},
    {heading:'Sales trend',lines:data.salesTrend.map(row=>row.period+': '+row.valueMinor+' minor units across '+row.count+' records')},
    {heading:'Inventory health',lines:data.inventoryHealth.map(row=>row.status+': '+row.count)},
    {heading:'Support status',lines:data.supportStatus.map(row=>row.status+': '+row.count)},
    {heading:'Connector footprint',lines:data.connectorProviders.map(row=>row.provider+': '+row.count)},
    {heading:'Recommendations',lines:data.recommendations.map(row=>row.priority.toUpperCase()+' — '+row.title+': '+row.reason+' Action: '+row.action)},
    {heading:'Method note',lines:['Bounded operational report. Recorded sales are not equivalent to collected cash. External connector data is canonical only after approved Data Exchange rules.']},
  ];
}
function slidesFrom(data){
  return [
    {title:'TeknTandao Executive Intelligence',lines:['Generated from bounded workspace operational data','Recorded sales are not equivalent to collected cash','Recommendations are deterministic unless explicitly regenerated with AI']},
    {title:'Executive KPIs',lines:data.kpis.slice(0,10).map(row=>row.metric+': '+row.value)},
    {title:'Recorded sales trend',bars:data.salesTrend.map(row=>({label:row.period,value:row.valueMinor}))},
    {title:'Inventory health',bars:data.inventoryHealth.map(row=>({label:row.status,value:row.count}))},
    {title:'Support status',bars:data.supportStatus.map(row=>({label:row.status,value:row.count}))},
    {title:'Connector footprint',bars:data.connectorProviders.map(row=>({label:row.provider,value:row.count}))},
    {title:'Recommended actions',lines:data.recommendations.map(row=>row.priority.toUpperCase()+': '+row.title+' — '+row.action)},
  ];
}
function render(format,data,title){
  if(format==='csv')return buildCsv([
    ...data.kpis.map(row=>({section:'KPI',...row})),
    ...data.salesTrend.map(row=>({section:'SalesTrend',metric:row.period,value:row.valueMinor,detail:'count='+row.count})),
    ...data.inventoryHealth.map(row=>({section:'InventoryHealth',metric:row.status,value:row.count,detail:''})),
    ...data.supportStatus.map(row=>({section:'SupportStatus',metric:row.status,value:row.count,detail:''})),
    ...data.connectorProviders.map(row=>({section:'ConnectorProvider',metric:row.provider,value:row.count,detail:''})),
    ...data.recommendations.map(row=>({section:'Recommendation',metric:row.title,value:row.priority,detail:row.reason+' Action: '+row.action})),
  ]);
  if(format==='xlsx')return buildXlsx({KPIs:data.kpis,SalesTrend:data.salesTrend,Inventory:data.inventoryHealth,Support:data.supportStatus,Connectors:data.connectorProviders,Recommendations:data.recommendations});
  if(format==='docx')return buildDocx(title,sectionsFrom(data));
  if(format==='pptx')return buildPptx(slidesFrom(data));
  if(format==='pdf'){
    const lines=sectionsFrom(data).flatMap(section=>[section.heading,...section.lines,'']);
    return buildPdf(title,lines);
  }
  throw new Error('Unsupported export format');
}

async function readCredential(org,id){
  const snapshot=await credentials(org,id).get();
  if(!snapshot.exists)throw new Error('Reconnect the Microsoft service');
  return decryptCredential(snapshot.data(),encryptionKey.value(),org.id+'/'+id);
}
function oauthConfigFor(provider){
  const all=JSON.parse(oauthConfig.value()||'{}');
  const config=all[provider]||(provider==='powerbi'?all.microsoft:null);
  if(!config?.clientId||!config?.clientSecret)throw new Error('Configure '+provider+' OAuth credentials');
  return config;
}
async function refreshMicrosoftToken(org,id,provider,credential){
  if(!credential.expiresAt||credential.expiresAt>Date.now()+60000)return credential.access_token;
  if(!credential.refresh_token)throw new Error('Microsoft connection expired; reconnect');
  const config=oauthConfigFor(provider),tenant=config.tenant||'common';
  const scope=provider==='microsoft'
    ?'offline_access User.Read Files.ReadWrite'
    :'offline_access https://analysis.windows.net/powerbi/api/Dataset.ReadWrite.All';
  const updated=await providerJson(
    'https://login.microsoftonline.com/'+encodeURIComponent(tenant)+'/oauth2/v2.0/token',
    {
      method:'POST',
      headers:{'Content-Type':'application/x-www-form-urlencoded'},
      body:new URLSearchParams({grant_type:'refresh_token',refresh_token:credential.refresh_token,client_id:config.clientId,client_secret:config.clientSecret,scope}).toString(),
    },
  );
  const merged={...credential,...updated,expiresAt:Date.now()+(updated.expires_in||3600)*1000};
  await credentials(org,id).set(encryptCredential(merged,encryptionKey.value(),org.id+'/'+id));
  return merged.access_token;
}
async function microsoftToken(org,id,provider){
  const connection=(await org.collection('toolConnections').doc(automationId.parse(id)).get()).data();
  if(!connection||connection.status!=='connected'||connection.provider!==provider)throw new Error('Select a connected '+provider+' connection');
  const credential=await readCredential(org,id);
  return refreshMicrosoftToken(org,id,provider,credential);
}

async function savePrivateExport(org,user,filename,format,buffer){
  const id='export_'+randomUUID();
  const path='report-exports/'+org.id+'/'+id+'/'+filename;
  const file=bucket().file(path);
  await file.save(buffer,{resumable:false,metadata:{contentType:mimeFor(format),cacheControl:'private, max-age=0, no-store'}});
  const expires=Date.now()+15*60*1000;
  const [url]=await file.getSignedUrl({version:'v4',action:'read',expires});
  await org.collection('reportExports').doc(id).set({
    id,filename,format,size:buffer.length,storagePath:path,createdBy:user,createdAt:stamp(),expiresAt:expires,retainedUntil:Timestamp.fromMillis(Date.now()+7*86400000),destination:'download',
  });
  return {id,filename,format,size:buffer.length,url,expiresAt:expires};
}

export const exportExecutiveReport=callable(async request=>{
  const {org,user}=await authorize(request);
  const format=z.enum(['csv','xlsx','pptx','docx','pdf']).parse(request.data.format);
  const title=cleanFilename(request.data.title||'TeknTandao Executive Intelligence');
  const facts=await loadExecutiveFacts(org),data=reportData(facts),buffer=render(format,data,title);
  const filename=title+'.'+format;
  return savePrivateExport(org,user,filename,format,buffer);
});

export const exportExecutiveReportToOneDrive=callable(async request=>{
  const {org,user}=await authorize(request,{ownerOnly:true});
  const format=z.enum(['csv','xlsx','pptx','docx','pdf']).parse(request.data.format);
  const connectionId=automationId.parse(request.data.connectionId);
  const title=cleanFilename(request.data.title||'TeknTandao Executive Intelligence');
  const facts=await loadExecutiveFacts(org),data=reportData(facts),buffer=render(format,data,title),filename=title+'.'+format;
  const token=await microsoftToken(org,connectionId,'microsoft');
  const folderName='TeknTandao Exports';
  const folderLookup=await fetch('https://graph.microsoft.com/v1.0/me/drive/root:/'+encodeURIComponent(folderName),{
    headers:{Authorization:'Bearer '+token},redirect:'error',signal:AbortSignal.timeout(30000),
  });
  if(folderLookup.status===404){
    const createdFolder=await fetch('https://graph.microsoft.com/v1.0/me/drive/root/children',{
      method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
      body:JSON.stringify({name:folderName,folder:{},'@microsoft.graph.conflictBehavior':'fail'}),redirect:'error',signal:AbortSignal.timeout(30000),
    });
    if(!createdFolder.ok&&createdFolder.status!==409){
      const folderError=await createdFolder.json().catch(()=>({}));
      throw new Error(folderError?.error?.message||'Unable to create OneDrive export folder');
    }
  }else if(!folderLookup.ok){
    const folderError=await folderLookup.json().catch(()=>({}));
    throw new Error(folderError?.error?.message||'Unable to access OneDrive export folder');
  }
  const folder=encodeURIComponent(folderName),fileName=encodeURIComponent(filename);
  const response=await fetch('https://graph.microsoft.com/v1.0/me/drive/root:/'+folder+'/'+fileName+':/content',{
    method:'PUT',
    headers:{Authorization:'Bearer '+token,'Content-Type':mimeFor(format)},
    body:buffer,
    redirect:'error',
    signal:AbortSignal.timeout(60000),
  });
  const payload=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(payload?.error?.message||'OneDrive upload failed');
  const id='export_'+randomUUID();
  await org.collection('reportExports').doc(id).set({
    id,filename,format,size:buffer.length,destination:'onedrive',connectionId,providerItemId:payload.id||null,webUrl:payload.webUrl||null,createdBy:user,createdAt:stamp(),
  });
  return {id,filename,format,size:buffer.length,webUrl:payload.webUrl||null,providerItemId:payload.id||null};
},[encryptionKey,oauthConfig]);

function powerBiTables(){
  return [
    {name:'KPIs',columns:[{name:'GeneratedAt',dataType:'DateTime'},{name:'Metric',dataType:'string'},{name:'Value',dataType:'Double'},{name:'Detail',dataType:'string'}]},
    {name:'SalesTrend',columns:[{name:'GeneratedAt',dataType:'DateTime'},{name:'Period',dataType:'string'},{name:'ValueMinor',dataType:'Int64'},{name:'Count',dataType:'Int64'}]},
    {name:'Recommendations',columns:[{name:'GeneratedAt',dataType:'DateTime'},{name:'Priority',dataType:'string'},{name:'Title',dataType:'string'},{name:'Reason',dataType:'string'},{name:'Action',dataType:'string'},{name:'Source',dataType:'string'}]},
  ];
}
async function pushRows(token,datasetId,tableName,rows){
  const response=await fetch('https://api.powerbi.com/v1.0/myorg/datasets/'+encodeURIComponent(datasetId)+'/tables/'+encodeURIComponent(tableName)+'/rows',{
    method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({rows}),redirect:'error',signal:AbortSignal.timeout(45000),
  });
  if(!response.ok){
    const payload=await response.json().catch(()=>({}));
    throw new Error(payload?.error?.message||('Power BI row push failed for '+tableName));
  }
}
export const publishExecutiveDataToPowerBi=callable(async request=>{
  const {org,user}=await authorize(request,{ownerOnly:true});
  const connectionId=automationId.parse(request.data.connectionId);
  const requestedDatasetId=request.data.datasetId?z.string().regex(/^[A-Za-z0-9-]{10,100}$/).parse(request.data.datasetId):null;
  const datasetName=cleanFilename(request.data.datasetName||'TeknTandao Executive Intelligence');
  const token=await microsoftToken(org,connectionId,'powerbi');
  let datasetId=requestedDatasetId,created=false;
  if(!datasetId){
    const response=await fetch('https://api.powerbi.com/v1.0/myorg/datasets?defaultRetentionPolicy=basicFIFO',{
      method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
      body:JSON.stringify({name:datasetName,defaultMode:'Push',tables:powerBiTables()}),redirect:'error',signal:AbortSignal.timeout(45000),
    });
    const payload=await response.json().catch(()=>({}));
    if(!response.ok||!payload.id)throw new Error(payload?.error?.message||'Power BI semantic model creation failed');
    datasetId=payload.id;created=true;
  }
  const facts=await loadExecutiveFacts(org),data=reportData(facts),generatedAt=new Date().toISOString();
  await pushRows(token,datasetId,'KPIs',data.kpis.map(row=>({GeneratedAt:generatedAt,Metric:row.metric,Value:Number(row.value)||0,Detail:row.detail})));
  await pushRows(token,datasetId,'SalesTrend',data.salesTrend.map(row=>({GeneratedAt:generatedAt,Period:row.period,ValueMinor:Math.round(Number(row.valueMinor)||0),Count:Math.round(Number(row.count)||0)})));
  await pushRows(token,datasetId,'Recommendations',data.recommendations.map(row=>({GeneratedAt:generatedAt,Priority:row.priority,Title:row.title,Reason:row.reason,Action:row.action,Source:row.source})));
  const id='export_'+randomUUID();
  await org.collection('reportExports').doc(id).set({id,format:'powerbi',destination:'powerbi',connectionId,datasetId,datasetName,createdDataset:created,createdBy:user,createdAt:stamp(),generatedAt});
  return {id,datasetId,datasetName,created,generatedAt};
},[encryptionKey,oauthConfig]);

export const getReportExportHistory=callable(async request=>{
  const {org}=await authorize(request);
  const snapshots=await org.collection('reportExports').orderBy('createdAt','desc').limit(50).get();
  return {exports:snapshots.docs.map(doc=>{const data=doc.data();return {...data,id:doc.id,createdAt:data.createdAt?.toMillis?.()??null};})};
});


export const purgeExpiredReportExports=onSchedule({
  schedule:'every 24 hours',
  region,
  timeZone:'UTC',
  timeoutSeconds:300,
  memory:'256MiB',
},async()=>{
  const expired=await db.collectionGroup('reportExports')
    .where('retainedUntil','<=',Timestamp.now())
    .limit(200)
    .get();
  for(const doc of expired.docs){
    try{
      const data=doc.data();
      if(data.storagePath)await bucket().file(data.storagePath).delete({ignoreNotFound:true});
      await doc.ref.set({
        storagePath:null,
        state:'source_purged',
        purgedAt:stamp(),
        retainedUntil:FieldValue.delete(),
      },{merge:true});
    }catch(error){
      console.error('Report export purge failed',doc.ref.path,error);
    }
  }
});
