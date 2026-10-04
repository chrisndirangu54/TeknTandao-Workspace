import {XMLParser} from 'fast-xml-parser';
import {z} from 'zod';

export const domainName = z.string().trim().toLowerCase().max(70).regex(/^(?!-)[a-z0-9-]+(?<!-)\.(?:com|net|org|co|io|biz|info)$/);
export const registrantSchema = z.object({
  FirstName: z.string().min(1).max(100), LastName: z.string().min(1).max(100),
  Address1: z.string().min(1).max(255), City: z.string().min(1).max(50),
  StateProvince: z.string().min(1).max(50), PostalCode: z.string().min(1).max(50),
  Country: z.string().regex(/^[A-Z]{2}$/), Phone: z.string().regex(/^\+\d{1,3}\.\d{5,15}$/),
  EmailAddress: z.string().email().max(254),
}).strict();
export function parseNamecheapResponse(xml) {
  if (typeof xml !== 'string' || Buffer.byteLength(xml) > 1000000 || /<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error('Invalid registrar response');
  const response = new XMLParser({ignoreAttributes: false, attributeNamePrefix: '', parseAttributeValue: false, parseTagValue: false, processEntities: false}).parse(xml).ApiResponse;
  if (!response || response.Status !== 'OK') throw new Error('Namecheap rejected the request; check registrar configuration and account funds');
  return response.CommandResponse;
}
export async function namecheapCall(config, command, input = {}) {
  if (!config?.apiUser || !config.apiKey || !config.clientIp || !config.username) throw new Error('Configure NAMECHEAP_CONFIG and a whitelisted static IPv4 egress address');
  if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(config.clientIp)) throw new Error('Namecheap requires a whitelisted IPv4 address');
  const endpoint = config.sandbox === true ? 'https://api.sandbox.namecheap.com/xml.response' : 'https://api.namecheap.com/xml.response';
  const response = await fetch(endpoint, {method: 'POST', redirect: 'error', signal: AbortSignal.timeout(45000), headers: {'Content-Type': 'application/x-www-form-urlencoded'}, body: new URLSearchParams({...input, ApiUser: config.apiUser, ApiKey: config.apiKey, UserName: config.username, ClientIp: config.clientIp, Command: command}).toString()});
  if (!response.ok) throw new Error(`Registrar unavailable (${response.status})`);
  const reader = response.body.getReader();
  const chunks = []; let bytes = 0;
  try {
    for (;;) { const {done, value} = await reader.read(); if (done) break; bytes += value.byteLength; if (bytes > 1000000) throw new Error('Registrar response is too large'); chunks.push(Buffer.from(value)); }
  } finally { await reader.cancel(); }
  return parseNamecheapResponse(Buffer.concat(chunks).toString('utf8'));
}
const array = value => Array.isArray(value) ? value : value ? [value] : [];
export function registrationPrice(response, tld) {
  for (const type of array(response.UserGetPricingResult?.ProductType)) {
    for (const category of array(type.ProductCategory)) {
      if (category.Name !== 'REGISTER') continue;
      for (const product of array(category.Product)) {
        if (String(product.Name).toLowerCase() !== tld.toLowerCase()) continue;
        const price = array(product.Price).find(item => item.Duration === '1' && item.DurationType === 'YEAR' && item.Currency === 'USD');
        if (price) {
          const amount = Number(price.Price) + Number(price.AdditionalCost || 0);
          if (Number.isFinite(amount) && amount >= 0) return amount;
        }
      }
    }
  }
  throw new Error('Registrar did not return a supported one-year USD price');
}
export async function quoteNamecheapDomain(config, rawDomain) {
  const domain = domainName.parse(rawDomain);
  const check = await namecheapCall(config, 'namecheap.domains.check', {DomainList: domain});
  const result = array(check.DomainCheckResult).find(item => String(item.Domain).toLowerCase() === domain);
  if (!result || String(result.Available).toLowerCase() !== 'true') throw new Error('Domain is unavailable');
  if (String(result.IsPremiumName).toLowerCase() === 'true' || String(result.IsPremiumDomain).toLowerCase() === 'true') throw new Error('Premium domains require a separate registrar review');
  if (Number(result.EapFee || 0) !== 0 || Number(result.ErrorNo || 0) !== 0) throw new Error('This domain requires a separate registrar review');
  const icannFeeUsd = Number(result.IcannFee || 0);
  if (!Number.isFinite(icannFeeUsd) || icannFeeUsd < 0) throw new Error('Invalid ICANN fee');
  const pricing = await namecheapCall(config, 'namecheap.users.getPricing', {ProductType: 'DOMAIN', ProductCategory: 'DOMAINS', ActionName: 'REGISTER', ProductName: domain.split('.').at(-1)});
  const registrationUsd = registrationPrice(pricing, domain.split('.').at(-1));
  return {domain, years: 1, registrationUsd, icannFeeUsd, amountUsd: Math.round((registrationUsd + icannFeeUsd) * 100) / 100, sandbox: config.sandbox === true};
}
export async function registerNamecheapDomain(config, domain, contact) {
  domainName.parse(domain);
  const details = registrantSchema.parse(contact);
  const input = {DomainName: domain, Years: '1', AddFreeWhoisguard: 'yes', WGEnabled: 'yes'};
  for (const prefix of ['Registrant', 'Tech', 'Admin', 'AuxBilling']) for (const [key, value] of Object.entries(details)) input[`${prefix}${key}`] = value;
  const result = (await namecheapCall(config, 'namecheap.domains.create', input)).DomainCreateResult;
  if (!result || String(result.Registered).toLowerCase() !== 'true') throw new Error('Registration is not confirmed; inspect Namecheap before retrying');
  return {domain, registered: true, chargedUsd: Number(result.ChargedAmount), domainId: String(result.DomainID), orderId: String(result.OrderID), sandbox: config.sandbox === true};
}
