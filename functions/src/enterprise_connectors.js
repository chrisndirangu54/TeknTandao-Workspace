import {z} from 'zod';
import {boundedJson} from './automation_domain.js';

const string = {type:'string'};
const number = {type:'number'};
const boolean = {type:'boolean'};
const array = items => ({type:'array', items});
const tool = (name, description, properties, required=[]) => ({
  name, description,
  inputSchema:{type:'object',properties,required,additionalProperties:false}
});

export const enterpriseBuiltinTools = Object.freeze({
  salesforce:[
    tool('salesforce_accounts','List Salesforce accounts',{limit:number}),
    tool('salesforce_contacts','List Salesforce contacts',{limit:number}),
    tool('salesforce_opportunities','List Salesforce opportunities',{limit:number}),
    tool('salesforce_upsert_contact','Create or update a contact by email',{
      email:string,firstName:string,lastName:string,phone:string,accountId:string
    },['email']),
  ],
  atlassian:[
    tool('jira_search_issues','Search Jira issues with JQL',{jql:string,maxResults:number},['jql']),
    tool('jira_create_issue','Create a Jira issue',{
      projectKey:string,issueType:string,summary:string,description:string
    },['projectKey','issueType','summary']),
    tool('jira_add_comment','Add a comment to a Jira issue',{issueKey:string,body:string},['issueKey','body']),
    tool('jira_projects','List accessible Jira projects',{}),
  ],
  zoho:[
    tool('zoho_contacts','List Zoho CRM contacts',{page:number,perPage:number}),
    tool('zoho_deals','List Zoho CRM deals',{page:number,perPage:number}),
    tool('zoho_upsert_contact','Upsert a Zoho CRM contact by email',{
      email:string,firstName:string,lastName:string,phone:string,accountName:string
    },['email']),
  ],
  odoo:[
    tool('odoo_contacts','List Odoo contacts',{limit:number}),
    tool('odoo_sale_orders','List Odoo sale orders',{limit:number}),
    tool('odoo_products','List Odoo products',{limit:number}),
    tool('odoo_create_contact','Create an Odoo contact',{
      name:string,email:string,phone:string,companyType:string
    },['name']),
  ],
});

const http = async (url, options={}) => {
  const response = await fetch(url,{
    ...options,
    redirect:'error',
    signal:AbortSignal.timeout(20000),
  });
  const text = await response.text();
  let payload;
  try { payload = text ? JSON.parse(text) : {}; } catch { payload = {raw:text}; }
  if(!response.ok) throw new Error(`Connector provider returned HTTP ${response.status}`);
  return boundedJson(payload);
};

const cleanBase = raw => {
  const url = new URL(String(raw));
  if(url.protocol !== 'https:' || url.username || url.password) throw new Error('Connector URL must be public HTTPS');
  url.pathname = url.pathname.replace(/\/+$/,'');
  url.search = '';
  url.hash = '';
  return url.toString().replace(/\/$/,'');
};

const commonLimit = z.number().int().min(1).max(200).default(50);

const schemas = {
  salesforce_accounts:z.object({limit:commonLimit}).strict(),
  salesforce_contacts:z.object({limit:commonLimit}).strict(),
  salesforce_opportunities:z.object({limit:commonLimit}).strict(),
  salesforce_upsert_contact:z.object({
    email:z.string().email().max(254),
    firstName:z.string().max(120).optional(),
    lastName:z.string().max(120).optional(),
    phone:z.string().max(80).optional(),
    accountId:z.string().max(80).optional(),
  }).strict(),
  jira_search_issues:z.object({jql:z.string().min(1).max(2000),maxResults:z.number().int().min(1).max(100).default(50)}).strict(),
  jira_create_issue:z.object({
    projectKey:z.string().regex(/^[A-Z][A-Z0-9_]{1,19}$/),
    issueType:z.string().min(1).max(80),
    summary:z.string().min(1).max(255),
    description:z.string().max(10000).optional(),
  }).strict(),
  jira_add_comment:z.object({
    issueKey:z.string().regex(/^[A-Z][A-Z0-9_]*-[0-9]+$/),
    body:z.string().min(1).max(10000),
  }).strict(),
  jira_projects:z.object({}).strict(),
  zoho_contacts:z.object({page:z.number().int().min(1).max(1000).default(1),perPage:z.number().int().min(1).max(200).default(50)}).strict(),
  zoho_deals:z.object({page:z.number().int().min(1).max(1000).default(1),perPage:z.number().int().min(1).max(200).default(50)}).strict(),
  zoho_upsert_contact:z.object({
    email:z.string().email().max(254),
    firstName:z.string().max(120).optional(),
    lastName:z.string().max(120).optional(),
    phone:z.string().max(80).optional(),
    accountName:z.string().max(160).optional(),
  }).strict(),
  odoo_contacts:z.object({limit:commonLimit}).strict(),
  odoo_sale_orders:z.object({limit:commonLimit}).strict(),
  odoo_products:z.object({limit:commonLimit}).strict(),
  odoo_create_contact:z.object({
    name:z.string().min(1).max(200),
    email:z.string().email().max(254).optional(),
    phone:z.string().max(80).optional(),
    companyType:z.enum(['person','company']).default('person'),
  }).strict(),
};

async function salesforce(credential,name,args){
  const base=cleanBase(credential.instance_url);
  const headers={Authorization:`Bearer ${credential.access_token}`,'Content-Type':'application/json'};
  const query=async soql=>http(`${base}/services/data/v61.0/query?q=${encodeURIComponent(soql)}`,{headers});
  if(name==='salesforce_accounts') return query(`SELECT Id,Name,Industry,Phone,Website,LastModifiedDate FROM Account ORDER BY LastModifiedDate DESC LIMIT ${args.limit}`);
  if(name==='salesforce_contacts') return query(`SELECT Id,FirstName,LastName,Email,Phone,AccountId,LastModifiedDate FROM Contact ORDER BY LastModifiedDate DESC LIMIT ${args.limit}`);
  if(name==='salesforce_opportunities') return query(`SELECT Id,Name,Amount,StageName,CloseDate,AccountId,LastModifiedDate FROM Opportunity ORDER BY LastModifiedDate DESC LIMIT ${args.limit}`);
  if(name==='salesforce_upsert_contact'){
    const found=await query(`SELECT Id FROM Contact WHERE Email='${args.email.replaceAll("'","\\'")}' LIMIT 1`);
    const body=JSON.stringify({FirstName:args.firstName||'',LastName:args.lastName||args.email,Email:args.email,Phone:args.phone||null,AccountId:args.accountId||null});
    if(found.records?.[0]?.Id){
      await http(`${base}/services/data/v61.0/sobjects/Contact/${encodeURIComponent(found.records[0].Id)}`,{method:'PATCH',headers,body});
      return {id:found.records[0].Id,updated:true};
    }
    return http(`${base}/services/data/v61.0/sobjects/Contact`,{method:'POST',headers,body});
  }
  throw new Error('Unknown Salesforce tool');
}

async function atlassian(credential,name,args){
  const base=cleanBase(credential.site_url);
  const auth=Buffer.from(`${credential.email}:${credential.api_token}`).toString('base64');
  const headers={Authorization:`Basic ${auth}`,'Content-Type':'application/json','Accept':'application/json'};
  if(name==='jira_projects') return http(`${base}/rest/api/3/project/search?maxResults=100`,{headers});
  if(name==='jira_search_issues'){
    return http(`${base}/rest/api/3/search/jql`,{
      method:'POST',headers,
      body:JSON.stringify({jql:args.jql,maxResults:args.maxResults,fields:['summary','status','assignee','priority','updated','project']})
    });
  }
  if(name==='jira_create_issue'){
    const description=args.description?{
      type:'doc',version:1,content:[{type:'paragraph',content:[{type:'text',text:args.description}]}]
    }:undefined;
    return http(`${base}/rest/api/3/issue`,{
      method:'POST',headers,
      body:JSON.stringify({fields:{project:{key:args.projectKey},issuetype:{name:args.issueType},summary:args.summary,...(description?{description}:{})}})
    });
  }
  if(name==='jira_add_comment'){
    return http(`${base}/rest/api/3/issue/${encodeURIComponent(args.issueKey)}/comment`,{
      method:'POST',headers,
      body:JSON.stringify({body:{type:'doc',version:1,content:[{type:'paragraph',content:[{type:'text',text:args.body}]}]}})
    });
  }
  throw new Error('Unknown Atlassian tool');
}

async function zoho(credential,name,args){
  const base=cleanBase(credential.api_domain||'https://www.zohoapis.com');
  const headers={Authorization:`Zoho-oauthtoken ${credential.access_token}`,'Content-Type':'application/json'};
  if(name==='zoho_contacts') return http(`${base}/crm/v7/Contacts?page=${args.page}&per_page=${args.perPage}`,{headers});
  if(name==='zoho_deals') return http(`${base}/crm/v7/Deals?page=${args.page}&per_page=${args.perPage}`,{headers});
  if(name==='zoho_upsert_contact'){
    const data={Email:args.email,First_Name:args.firstName||'',Last_Name:args.lastName||args.email,Phone:args.phone||''};
    if(args.accountName) data.Account_Name={name:args.accountName};
    return http(`${base}/crm/v7/Contacts/upsert`,{
      method:'POST',headers,
      body:JSON.stringify({data:[data],duplicate_check_fields:['Email']})
    });
  }
  throw new Error('Unknown Zoho tool');
}

async function odooRpc(credential,model,method,args=[],kwargs={}){
  const base=cleanBase(credential.base_url);
  const payload={
    jsonrpc:'2.0',method:'call',id:Date.now(),
    params:{
      service:'object',method:'execute_kw',
      args:[credential.database,Number(credential.uid),credential.api_key,model,method,args,kwargs],
    },
  };
  const result=await http(`${base}/jsonrpc`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
  if(result.error) throw new Error('Odoo rejected the request');
  return boundedJson(result.result);
}

async function odoo(credential,name,args){
  if(name==='odoo_contacts') return odooRpc(credential,'res.partner','search_read',[[]],{fields:['id','name','email','phone','company_type','write_date'],limit:args.limit,order:'write_date desc'});
  if(name==='odoo_sale_orders') return odooRpc(credential,'sale.order','search_read',[[]],{fields:['id','name','partner_id','amount_total','state','date_order','write_date'],limit:args.limit,order:'write_date desc'});
  if(name==='odoo_products') return odooRpc(credential,'product.product','search_read',[[]],{fields:['id','display_name','default_code','list_price','qty_available','write_date'],limit:args.limit,order:'write_date desc'});
  if(name==='odoo_create_contact') return {id:await odooRpc(credential,'res.partner','create',[[{name:args.name,email:args.email||false,phone:args.phone||false,company_type:args.companyType}]])};
  throw new Error('Unknown Odoo tool');
}

export function validateEnterpriseCredential(provider,raw){
  const credential = {
    salesforce:z.object({access_token:z.string().min(10).max(8000),instance_url:z.string().url().max(1000)}).strict(),
    atlassian:z.object({email:z.string().email().max(254),api_token:z.string().min(10).max(8000),site_url:z.string().url().max(1000)}).strict(),
    zoho:z.object({access_token:z.string().min(10).max(8000),api_domain:z.string().url().max(1000).default('https://www.zohoapis.com')}).strict(),
    odoo:z.object({base_url:z.string().url().max(1000),database:z.string().min(1).max(120),uid:z.number().int().positive(),api_key:z.string().min(8).max(8000)}).strict(),
  }[provider]?.parse(raw);
  if(!credential) throw new Error('Unsupported enterprise provider');
  return credential;
}

export async function validateEnterpriseConnection(provider,credential){
  const first={
    salesforce:['salesforce_accounts',{limit:1}],
    atlassian:['jira_projects',{}],
    zoho:['zoho_contacts',{page:1,perPage:1}],
    odoo:['odoo_contacts',{limit:1}],
  }[provider];
  return callEnterpriseBuiltin(provider,credential,first[0],first[1]);
}

export async function callEnterpriseBuiltin(provider,credential,name,raw){
  if(!enterpriseBuiltinTools[provider]?.some(item=>item.name===name)) throw new Error('Tool is not part of this enterprise connection');
  const args=schemas[name].parse(raw);
  if(provider==='salesforce') return salesforce(credential,name,args);
  if(provider==='atlassian') return atlassian(credential,name,args);
  if(provider==='zoho') return zoho(credential,name,args);
  if(provider==='odoo') return odoo(credential,name,args);
  throw new Error('Unsupported enterprise connector');
}
