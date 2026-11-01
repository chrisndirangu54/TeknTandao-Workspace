// Multi-tenant Microsoft CSP sales workflow. No SKU, authorization or price is
// assumed from a product-family label. AI is advisory; it cannot purchase licenses.
import {createHash} from 'node:crypto';
import {microsoftProductFamilies,validateMicrosoftCatalogSelection,microsoftResellerChecklist} from './microsoft_reseller_catalog.js';
import {draftMicrosoftResellerAdvice} from './microsoft_reseller_ai_domain.js';

export const requestStates=Object.freeze([
 'quote_requested','quote_ready','customer_accepted_pending_partner_order',
 'manually_provisioned','declined','cancelled'
]);
export const allowedNeeds=Object.freeze(['collaboration','email','cloud','crm','erp',
 'analytics','automation','security','devices','education','developer']);

export function resellerSlug(value) {
 if(typeof value!=='string'||!/^[a-z0-9](?:[a-z0-9-]{1,34})[a-z0-9]$/.test(value))throw new Error('Invalid reseller shop URL identifier');
 return value;
}
export function purchaseIntentId(buyerOrgId,clientRequestId){
 if(typeof buyerOrgId!=='string'||!buyerOrgId.match(/^[\w-]{1,100}$/))throw new Error('Invalid buyer workspace');
 if(typeof clientRequestId!=='string'||!clientRequestId.match(/^[A-Za-z0-9_-]{8,80}$/))throw new Error('Invalid request identifier');
 return createHash('sha256').update(buyerOrgId+'\0'+clientRequestId).digest('hex').slice(0,40);
}
export function validatePurchaseIntent(value){
 if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Invalid purchase request');
 const selectedFamilies=validateMicrosoftCatalogSelection(value.families);
 const seats=value.seats;
 if(!Number.isSafeInteger(seats)||seats<1||seats>100000)throw new Error('Enter a valid seat quantity from 1 to 100000');
 const needs=value.needs;
 if(!Array.isArray(needs)||!needs.length||needs.length>allowedNeeds.length||new Set(needs).size!==needs.length||needs.some(x=>!allowedNeeds.includes(x)))throw new Error('Choose valid business needs');
 const note=typeof value.note==='string'?value.note.trim():'';
 if(note.length>1200)throw new Error('Customer note is too long');
 if(value.customerConfirmed!==true)throw new Error('Customer must confirm the quote request');
 // Family matches are informational, not a Microsoft license offer or SKU.
 const advice=draftMicrosoftResellerAdvice({seats,needs});
 return {families:selectedFamilies,seats,needs,note,advice};
}
export function verifiedManualQuote(value,seatCount){
 if(!Number.isSafeInteger(seatCount)||seatCount<1)throw new Error('Invalid order quantity');
 if(!value||typeof value!=='object')throw new Error('Quote required');
 if(value.commercialVerification!==true)throw new Error('An operator must verify the actual partner price and offer');
 const currency=value.currency;
 if(currency!=='KES')throw new Error('Only verified KES quotes are supported');
 const unitMinor=value.unitPriceMinor;
 if(!Number.isSafeInteger(unitMinor)||unitMinor<1||unitMinor>100000000)throw new Error('Invalid quote unit price');
 const sku=typeof value.sku==='string'?value.sku.trim():'';
 const reference=typeof value.supplierEvidence==='string'?value.supplierEvidence.trim():'';
 if(sku.length<3||sku.length>120||reference.length<5||reference.length>300)throw new Error('Record the actual eligible SKU and supplier quote reference');
 const duration=value.validDays;
 if(!Number.isSafeInteger(duration)||duration<1||duration>30)throw new Error('Quote validity must be 1–30 days');
 const totalMinor=unitMinor*seatCount;
 if(!Number.isSafeInteger(totalMinor)||totalMinor>100000000000)throw new Error('Quote amount exceeds platform limit');
 return {currency,unitPriceMinor:unitMinor,totalMinor,sku,supplierEvidence:reference,validDays:duration,
   verifiedByOperator:true,providerOrderPlaced:false,paid:false};
}
export function recommendMicrosoftProducts({seats,needs}){
 const advice=draftMicrosoftResellerAdvice({seats,needs});
 return {...advice,productFamilies:microsoftProductFamilies,checklist:microsoftResellerChecklist,
  externalOrderPlaced:false,authorizationChecked:false};
}
export function canAcceptQuote(order,now=Date.now()){
 return order?.status==='quote_ready'&&
  order.quote?.verifiedByOperator===true&&
  Number(order.quote?.expiresAtMs)>now&&
  order.quote?.paid!==true&&order.quote?.providerOrderPlaced!==true;
}
export function automationSteps(state){
 const steps={
 quote_requested:['AI-assisted needs review','Partner eligibility and SKU verification','Human pricing approval'],
 quote_ready:['Customer reviews binding offer','Customer approves quote','Provider order prerequisites validated'],
 customer_accepted_pending_partner_order:['Check reseller relationship and MCA','Verify authorized provider channel','Place approved provider order with explicit authorization','Reconcile provider receipt before marking fulfilled'],
 manually_provisioned:['Verify licenses and handover','Plan renewal reminders'],
 declined:[],cancelled:[]
 };
 return steps[state]||[];
}
