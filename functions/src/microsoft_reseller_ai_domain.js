// Deterministic, explainable recommendation baseline; never invent SKUs, prices or CSP rights.
// AI text suggestions may augment these recommendations but cannot activate licenses.
import {microsoftProductFamilies,validateMicrosoftCatalogSelection,microsoftResellerChecklist} from './microsoft_reseller_catalog.js';
export function draftMicrosoftResellerAdvice(input){
 if(!input||typeof input!=='object')throw new Error('Customer requirements required');
 const seats=input.seats;
 if(!Number.isSafeInteger(seats)||seats<1||seats>100000)throw new Error('Seat count must be 1–100000');
 const needs=Array.isArray(input.needs)?input.needs:[];
 const allowed=['collaboration','email','cloud','crm','erp','analytics','automation','security','devices','education','developer'];
 if(!needs.length||needs.length>allowed.length||needs.some(x=>!allowed.includes(x))||new Set(needs).size!==needs.length)
 throw new Error('Choose valid customer needs');
 const mapping={collaboration:'m365',email:'m365',cloud:'azure',crm:'dynamics',erp:'dynamics',analytics:'power',
 automation:'power',security:'security',devices:'windows365',education:'education',developer:'server'};
 const ids=[...new Set(needs.map(x=>mapping[x]))];
 validateMicrosoftCatalogSelection(ids);
 const selected=microsoftProductFamilies.filter(f=>ids.includes(f.id)).map(f=>({
  id:f.id,name:f.name,examples:f.examples,rationale:needs.filter(x=>mapping[x]===f.id),
  eligibility:'not_verified',skuSelected:false,quoteRequired:true
 }));
 return {seats,needs,recommendations:selected,requiredChecks:microsoftResellerChecklist,
  quote:{status:'draft_requires_partner_pricing',currency:null,total:null},
  aiMode:'explainable_rules',requiresHumanReview:true,canPurchase:false,canProvision:false};
}
