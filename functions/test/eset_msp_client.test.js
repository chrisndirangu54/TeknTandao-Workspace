import test from 'node:test';
import assert from 'node:assert/strict';
import {checkEsetMspAccount, summarizeEsetAccount, ESET_API_ORIGIN} from '../src/eset_msp_client.js';

test('summary excludes email, phone and other personal fields', () => {
  assert.deepEqual(summarizeEsetAccount({
    userId: 'u1', email: 'private@example.com', phoneNumber: 'secret',
    status: 1, company: {companyId: 'c1', name: 'Tenant', contact: 'secret'}
  }), {userId: 'u1', companyId: 'c1', companyName: 'Tenant', accountStatus: 1});
});
test('authentication and account check use fixed host, correct methods, bearer token', async () => {
  const calls = [];
  const mockFetch = async (url, opts) => {
    calls.push({url, opts});
    return {ok: true, json: async () => calls.length === 1 ?
      {accessToken: 'short-lived', refreshToken: 'never-store'} :
      {userId: 'u1', company: {companyId: 'c1', name: 'Example'}}};
  };
  const account = await checkEsetMspAccount({
    username: 'msp-user', password: 'secret', fetchFn: mockFetch
  });
  assert.equal(calls[0].url, ESET_API_ORIGIN + '/api/Token/Get');
  assert.equal(calls[0].opts.method, 'POST');
  assert.equal(calls[1].url, ESET_API_ORIGIN + '/api/User/Current');
  assert.equal(calls[1].opts.headers.Authorization, 'Bearer short-lived');
  assert.equal(calls[1].opts.method, 'GET');
  assert.equal(account.companyId, 'c1');
  assert.equal(JSON.stringify(account).includes('short-lived'), false);
});
test('provider errors do not leak body', async () => {
  await assert.rejects(checkEsetMspAccount({
    username: 'u', password: 'p',
    fetchFn: async () => ({ok: false, status: 401, text: async () => 'secret'})
  }), /HTTP 401/);
});
