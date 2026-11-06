// ESET MSP Administrator 2 / PROTECT Hub compatibility adapter.
// Read-only initial integration. All requests go to ESET's fixed HTTPS host.
export const ESET_API_ORIGIN = 'https://mspapi.eset.com';
export function summarizeEsetAccount(value) {
  if (!value || typeof value !== 'object') throw new Error('Invalid ESET account response');
  const company = value.company ?? {};
  return {
    companyId: typeof company.companyId === 'string' ? company.companyId : null,
    companyName: typeof company.name === 'string' ? company.name.slice(0, 160) : null,
    userId: typeof value.userId === 'string' ? value.userId : null,
    accountStatus: Number.isInteger(value.status) ? value.status : null
  };
}
async function esetJson(path, options = {}, fetchFn = fetch) {
  const response = await fetchFn(ESET_API_ORIGIN + path, {
    ...options,
    signal: AbortSignal.timeout(12000),
    headers: {accept: 'application/json', 'content-type': 'application/json', ...(options.headers || {})},
    redirect: 'error'
  });
  if (!response.ok) {
    // Never forward error bodies; providers may echo sensitive request data.
    const err = new Error('ESET API returned HTTP ' + response.status);
    err.status = response.status;
    throw err;
  }
  return response.json();
}
export async function checkEsetMspAccount({username, password, fetchFn = fetch}) {
  if (!username || !password) throw new Error('ESET credentials are not configured');
  const token = await esetJson('/api/Token/Get', {
    method: 'POST', body: JSON.stringify({username, password})
  }, fetchFn);
  if (!token?.accessToken || typeof token.accessToken !== 'string')
    throw new Error('ESET token response did not include an access token');
  // ESET access tokens expire after approximately one minute; do not cache or persist.
  const data = await esetJson('/api/User/Current', {
    method: 'GET', headers: {Authorization: 'Bearer ' + token.accessToken}
  }, fetchFn);
  return summarizeEsetAccount(data);
}
