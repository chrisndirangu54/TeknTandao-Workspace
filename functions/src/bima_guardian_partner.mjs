/**
 * Bima Guardian integration adapter for TeknTandao Workspace.
 * SERVER ONLY. Never expose BIMA_API_KEY to the browser or Flutter.
 * This module does not create or bind insurance policies.
 */
const PRODUCTS = Object.freeze({
  property: ['residential', 'commercial', 'all_risks', 'fire_theft'],
  medical: ['group', 'sme', 'corporate'],
  motor: ['private', 'commercial', 'fleet'],
  specialty: ['liability', 'professional_indemnity', 'cyber', 'event'],
  agriculture: ['crop', 'livestock', 'weather_indexed', 'agribusiness'],
});
export function validateInsuranceRequest(request) {
  const { tenantId, consentReference, applicantId, product, subtype, sumInsured } = request ?? {};
  if (![tenantId, consentReference, applicantId].every(x => typeof x === 'string' && x.trim().length > 0)) {
    throw new Error('Tenant, applicant, and consent are required');
  }
  if (!PRODUCTS[product]?.includes(subtype)) throw new Error('Unsupported Bima Guardian cover');
  if (!Number.isFinite(sumInsured) || sumInsured <= 0) throw new Error('Positive sumInsured required');
  return { tenantId, consentReference, applicantId, product, subtype, sumInsured };
}

/**
 * Call ONLY after verifying the authenticated Workspace admin/insurance delegate
 * has tenant permission and the consent reference belongs to the applicant.
 * Never accept those assertions solely from request body.
 */
export async function requestBimaGuardianQuote(input, { fetchImpl = fetch, config = process.env } = {}) {
  const validated = validateInsuranceRequest(input);
  const apiUrl = config.BIMA_API_BASE_URL;
  const apiKey = config.BIMA_API_KEY;
  if (!apiUrl || !apiKey) throw new Error('Bima Guardian backend not configured');
  const endpoint = new URL('/v1/quotes', apiUrl);
  if (endpoint.protocol !== 'https:') throw new Error('Bima Guardian must use HTTPS');
  const response = await fetchImpl(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
    body: JSON.stringify({
      product: validated.product,
      subtype: validated.subtype,
      sumInsured: validated.sumInsured,
      audience: 'sme',
    }),
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(`Bima Guardian unavailable: HTTP ${response.status}`);
  const result = await response.json();
  return {
    ...result,
    applicantId: validated.applicantId,
    tenantId: validated.tenantId,
    consentReference: validated.consentReference,
    warning: 'Indicative quote only. No insurer binding or policy has occurred.',
  };
}
