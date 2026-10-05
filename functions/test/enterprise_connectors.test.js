import test from 'node:test';
import assert from 'node:assert/strict';
import {
  enterpriseBuiltinTools,
  enterpriseBaseUrl,
  validateEnterpriseCredential,
} from '../src/enterprise_connectors.js';

test('enterprise connector catalog exposes bounded provider tools', () => {
  for (const provider of ['salesforce','atlassian','zoho','odoo','microsoft365','powerbi']) {
    assert.ok(Array.isArray(enterpriseBuiltinTools[provider]));
    assert.ok(enterpriseBuiltinTools[provider].length >= 3);
    for (const tool of enterpriseBuiltinTools[provider]) {
      assert.equal(tool.inputSchema.additionalProperties, false);
    }
  }
  assert.ok(enterpriseBuiltinTools.salesforce.some(tool => tool.name === 'salesforce_contacts'));
  assert.ok(enterpriseBuiltinTools.atlassian.some(tool => tool.name === 'jira_search_issues'));
  assert.ok(enterpriseBuiltinTools.zoho.some(tool => tool.name === 'zoho_deals'));
  assert.ok(enterpriseBuiltinTools.odoo.some(tool => tool.name === 'odoo_sale_orders'));
  assert.ok(enterpriseBuiltinTools.microsoft365.some(tool => tool.name === 'm365_drive_files'));
  assert.ok(enterpriseBuiltinTools.powerbi.some(tool => tool.name === 'powerbi_refresh_dataset'));
});

test('enterprise credentials are provider-specific and reject malformed input', () => {
  assert.equal(
    validateEnterpriseCredential('salesforce', {
      access_token:'a'.repeat(20),
      instance_url:'https://example.my.salesforce.com',
    }).instance_url,
    'https://example.my.salesforce.com',
  );
  assert.throws(() => validateEnterpriseCredential('salesforce', {
    access_token:'short',
    instance_url:'https://example.my.salesforce.com',
  }));
  assert.equal(
    validateEnterpriseCredential('atlassian', {
      email:'owner@example.com',
      api_token:'x'.repeat(20),
      site_url:'https://example.atlassian.net',
    }).email,
    'owner@example.com',
  );
  assert.throws(() => validateEnterpriseCredential('atlassian', {
    email:'not-email',
    api_token:'x'.repeat(20),
    site_url:'https://example.atlassian.net',
  }));
  assert.equal(
    validateEnterpriseCredential('zoho', {
      access_token:'z'.repeat(20),
      api_domain:'https://www.zohoapis.com',
    }).api_domain,
    'https://www.zohoapis.com',
  );
  assert.equal(
    validateEnterpriseCredential('microsoft365', {
      access_token:'m'.repeat(30),
    }).access_token.length,
    30,
  );
  assert.equal(
    validateEnterpriseCredential('powerbi', {
      access_token:'p'.repeat(30),
    }).access_token.length,
    30,
  );
  assert.equal(
    validateEnterpriseCredential('odoo', {
      base_url:'https://example.odoo.com',
      database:'example',
      api_key:'k'.repeat(20),
    }).database,
    'example',
  );
});

test('enterprise connector credentials reject unknown provider', () => {
  assert.throws(() => validateEnterpriseCredential('unknown', {}), /Unsupported/);
});


test('enterprise base URLs reject private networks and unsafe schemes', () => {
  for (const url of [
    'http://example.com',
    'https://localhost',
    'https://127.0.0.1',
    'https://10.0.0.1',
    'https://169.254.169.254',
    'https://example.com:8443',
    'https://user:pass@example.com',
  ]) {
    assert.throws(() => enterpriseBaseUrl(url), url);
  }
  assert.equal(enterpriseBaseUrl('https://example.com/'), 'https://example.com');
});
