import {compileWebsiteContent, websiteContentJsonSchema} from './website_components.js';
import {validateWebsiteBusinessPlan} from './website_business_ai_domain.js';

const text = maxLength => ({type: 'string', maxLength});
export const websitePlanContentSchema = {
  type: 'object', additionalProperties: false,
  required: ['summary', 'rationale', 'contentBlueprint', 'productChanges', 'publishRecommended', 'optimizationGoal'],
  properties: {
    summary: text(600), rationale: {type: 'array', maxItems: 12, items: text(500)},
    contentBlueprint: {anyOf: [websiteContentJsonSchema, {type: 'null'}]},
    productChanges: {type: 'array', maxItems: 25, items: {
      type: 'object', additionalProperties: false, required: ['mutationId', 'operation', 'productId', 'product', 'reason'],
      properties: {
        mutationId: text(100), operation: {type: 'string', enum: ['create', 'update']}, productId: {type: ['string', 'null']}, reason: text(600),
        product: {type: 'object', additionalProperties: false, properties: {
          ...Object.fromEntries(['name', 'sku', 'description', 'category', 'unit', 'imageUrl', 'seoTitle', 'seoDescription'].map(key => [key, text(key === 'description' ? 4000 : 500)])),
          ...Object.fromEntries(['price', 'stock', 'reorderLevel'].map(key => [key, {type: 'integer', minimum: 0}])),
          ...Object.fromEntries(['active', 'featured', 'websiteVisible'].map(key => [key, {type: 'boolean'}])),
        }},
      },
    }},
    publishRecommended: {type: 'boolean'}, optimizationGoal: text(300),
  },
};

export function compileWebsitePlan(raw, currentDocument) {
  if (!raw || Object.keys(raw).some(key => !Object.hasOwn(websitePlanContentSchema.properties, key))) throw new Error('AI plan must contain structured content, never website code or nodes');
  const compiled = raw.contentBlueprint === null ? null : compileWebsiteContent(raw.contentBlueprint);
  return {...validateWebsiteBusinessPlan({...raw, document: compiled?.document || currentDocument}), contentBlueprint: compiled?.blueprint || null};
}
