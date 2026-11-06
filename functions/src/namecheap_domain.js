// Pure Namecheap adapter data normalization. Never insert user input into XML.
import {XMLParser,XMLValidator} from 'fast-xml-parser';
import {z} from 'zod';

export const domainSchema=z.string().trim().toLowerCase().min(4).max(253)
 .refine(v=>/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(v),
  'Use an ASCII/Punycode domain, not a URL')
 .refine(v=>!v.includes('--')||v.split('.').every(x=>!x.startsWith('--')||x.startsWith('xn--')),
  'Invalid domain label');
const parser=new XMLParser({ignoreAttributes:false,attributeNamePrefix:'@_',
 parseAttributeValue:false,processEntities:false,ignoreDeclaration:true});
export function parseNamecheapResponse(xml){
 if(typeof xml!=='string'||xml.length>250000||XMLValidator.validate(xml)!==true)
  throw new Error('Malformed Namecheap API response');
 if(/<!DOCTYPE|<!ENTITY/i.test(xml))throw new Error('XML entities are forbidden');
 const result=parser.parse(xml).ApiResponse;
 if(!result||result['@_Status']!=='OK')throw new Error('Namecheap API rejected request');
 return result.CommandResponse||{};
}
export function parseDomainCheck(xml,requested){
 const name=domainSchema.parse(requested);
 const result=parseNamecheapResponse(xml).DomainCheckResult;
 const items=Array.isArray(result)?result:[result];
 const selected=items.find(x=>String(x?.['@_Domain']||'').toLowerCase()===name);
 if(!selected)throw new Error('Domain check result missing');
 return {domain:name,available:selected['@_Available']==='true',
  premium:selected['@_IsPremiumName']==='true',
  premiumRegistrationUsd:selected['@_IsPremiumName']==='true'?
    Number(selected['@_PremiumRegistrationPrice']):null,
  pricingVerified:false,registrar:'namecheap'};
}
export function parseDomainPrice(xml,tld){
 const types=parseNamecheapResponse(xml).UserGetPricingResult?.ProductType;
 const type=(Array.isArray(types)?types:[types]).find(x=>x?.['@_Name']==='DOMAIN');
 const cats=type?.ProductCategory;
 const category=(Array.isArray(cats)?cats:[cats]).find(x=>x?.['@_Name']==='REGISTER');
 const products=category?.Product;
 const product=(Array.isArray(products)?products:[products]).find(x=>
  String(x?.['@_Name']||'').toLowerCase()===tld.toLowerCase());
 const prices=product?.Price;
 const price=(Array.isArray(prices)?prices:[prices]).find(x=>x?.['@_Duration']==='1'&&x?.['@_DurationType']==='YEAR');
 const cost=Number(price?.['@_Price']);
 if(!Number.isFinite(cost)||cost<=0||price?.['@_Currency']!=='USD')
  throw new Error('Namecheap price not available');
 return {costUsd:cost,currency:'USD',years:1,source:'namecheap.users.getPricing'};
}
export const domainOrderSchema=z.object({
 domain:domainSchema,years:z.literal(1),customerApproved:z.literal(true),
 purpose:z.enum(['register','renew','transfer']).default('register')
}).strict();
export const hostingOrderSchema=z.object({
 domain:domainSchema,packageCode:z.enum(['starter','business','pro']),
 customerApproved:z.literal(true)
}).strict();
