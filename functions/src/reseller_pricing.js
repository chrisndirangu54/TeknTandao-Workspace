import {z} from 'zod';

const money = z.number().int().min(0).max(1000000000);
export const profitSchema = z.object({fixedMinor: money, markupBps: z.number().int().min(0).max(100000)}).strict();
export const resellerPricingSchema = z.object({
  currency: z.literal('KES'), monthlyProfit: profitSchema, generationProfit: profitSchema,
  tokenRates: z.object({
    model: z.string().min(1).max(150), inputPerMillionMinor: money,
    outputPerMillionMinor: money, cachedInputPerMillionMinor: money,
  }).strict(),
  usdToKes: z.number().positive().max(10000),
}).strict();

export function addProfit(costMinor, profit) {
  money.parse(costMinor);
  const validated = profitSchema.parse(profit);
  const profitMinor = validated.fixedMinor + Math.ceil(costMinor * validated.markupBps / 10000);
  const totalMinor = costMinor + profitMinor;
  money.parse(totalMinor);
  return {costMinor, profitMinor, totalMinor, currency: 'KES'};
}
export function tokenUsage(metadata) {
  if (!metadata || !Number.isSafeInteger(metadata.promptTokenCount) || !Number.isSafeInteger(metadata.candidatesTokenCount)) throw new Error('Provider did not return complete token usage');
  const usage = {
    inputTokens: metadata.promptTokenCount,
    outputTokens: metadata.candidatesTokenCount,
    cachedInputTokens: metadata.cachedContentTokenCount || 0,
    thinkingTokens: metadata.thoughtsTokenCount || 0,
  };
  for (const count of Object.values(usage)) z.number().int().min(0).max(100000000).parse(count);
  if (usage.cachedInputTokens > usage.inputTokens) throw new Error('Invalid cached token count');
  return usage;
}
export function generationPrice(usage, pricing, model) {
  usage = tokenUsage({promptTokenCount: usage.inputTokens, candidatesTokenCount: usage.outputTokens, cachedContentTokenCount: usage.cachedInputTokens, thoughtsTokenCount: usage.thinkingTokens});
  const policy = resellerPricingSchema.parse(pricing);
  if (policy.tokenRates.model !== model) throw new Error('Configure token prices for the generation model');
  const rates = policy.tokenRates;
  const numerator = BigInt(usage.inputTokens - usage.cachedInputTokens) * BigInt(rates.inputPerMillionMinor) + BigInt(usage.cachedInputTokens) * BigInt(rates.cachedInputPerMillionMinor) + BigInt(usage.outputTokens + usage.thinkingTokens) * BigInt(rates.outputPerMillionMinor);
  const costMinor = Number((numerator + 999999n) / 1000000n);
  return {...addProfit(costMinor, policy.generationProfit), usage, model, rates};
}
export function monthlyBundlePrice(firebaseCostMinor, pricing) {
  const policy = resellerPricingSchema.parse(pricing);
  return {...addProfit(firebaseCostMinor, policy.monthlyProfit), basis: 'allocated_firebase_cost_plus_profit', domainBilling: 'annual_pass_through'};
}
export function domainCostMinor(usd, exchangeRate) {
  z.number().finite().min(0).max(100000).parse(usd);
  z.number().positive().max(10000).parse(exchangeRate);
  return Math.ceil(usd * exchangeRate * 100);
}
