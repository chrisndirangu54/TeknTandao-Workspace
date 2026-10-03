import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {boundedJson, decryptCredential, encryptCredential, featureInput, featureSchema, hasPaidSubscription, resolveArguments, runCustomCode, workflowSchema} from '../src/automation_domain.js';
import {builtinTools, callBuiltin, isPublicAddress, remoteUrl} from '../src/automation_connectors.js';

const feature = () => featureSchema.parse({name: 'Quote', description: 'Calculate a quote', fields: [{key: 'quantity', label: 'Quantity', type: 'number', required: true}], code: 'return {total: input.quantity * 100};'});

test('premium access requires a currently paid installation, never a trial', () => {
  const now = 100;
  assert.equal(hasPaidSubscription([{state: 'trial', expiresAt: {toMillis: () => 200}}], now), false);
  assert.equal(hasPaidSubscription([{state: 'paid', expiresAt: {toMillis: () => 99}}], now), false);
  assert.equal(hasPaidSubscription([{state: 'paid', expiresAt: {toMillis: () => 200}}], now), true);
  assert.equal(hasPaidSubscription([]), false);
});
test('workflow definitions reject executable or unknown configuration', () => {
  const parsed = workflowSchema.parse({name: 'Save file', steps: [{kind: 'tool', connectionId: 'google', tool: 'drive_create_text', arguments: {name: '{{input.name}}'}}]});
  assert.equal(parsed.enabled, false);
  assert.equal(parsed.trigger, 'manual');
  assert.throws(() => workflowSchema.parse({...parsed, orgId: 'another-workspace'}));
  assert.throws(() => workflowSchema.parse({...parsed, steps: [{kind: 'tool', connectionId: '../other', tool: 'send'}]}));
  assert.throws(() => workflowSchema.parse({...parsed, steps: Array(11).fill(parsed.steps[0])}));
});
test('references preserve JSON types and reject inherited properties', () => {
  assert.deepEqual(resolveArguments({quantity: '{{input.quantity}}', id: '{{steps.0.id}}', literal: 'Hi {{input.name}}'}, {input: {quantity: 3}, steps: [{id: 'one'}]}), {quantity: 3, id: 'one', literal: 'Hi {{input.name}}'});
  assert.throws(() => resolveArguments('{{input.constructor}}', {input: {}}));
  assert.throws(() => resolveArguments('{{input.missing}}', {input: {}}));
  assert.throws(() => resolveArguments(JSON.parse('{"__proto__": 1}'), {}));
});
test('credentials are authenticated and cannot be moved across tenants', () => {
  const key = randomBytes(32).toString('base64');
  const value = encryptCredential({token: 'sensitive'}, key, 'org1/connection1');
  assert.ok(!JSON.stringify(value).includes('sensitive'));
  assert.deepEqual(decryptCredential(value, key, 'org1/connection1'), {token: 'sensitive'});
  assert.throws(() => decryptCredential(value, key, 'org2/connection1'));
  assert.throws(() => decryptCredential({...value, tag: randomBytes(16).toString('base64')}, key, 'org1/connection1'));
  assert.throws(() => encryptCredential({}, 'invalid', 'org'));
});
test('remote endpoints reject SSRF addresses, credentials and redirects in URLs', () => {
  for (const url of ['http://example.com/mcp', 'https://localhost/mcp', 'https://127.0.0.1/mcp', 'https://169.254.169.254/mcp', 'https://[::1]/mcp', 'https://user:secret@example.com/mcp', 'https://example.com:8443/mcp', 'https://example.com/mcp?token=secret']) assert.throws(() => remoteUrl(url), url);
  assert.equal(remoteUrl('https://tools.example.com/mcp').hostname, 'tools.example.com');
  for (const ip of ['127.0.0.1', '10.0.0.1', '172.16.0.1', '192.168.1.1', '169.254.169.254', '0.0.0.0', '::1', '::ffff:127.0.0.1', 'fc00::1', 'fe80::1', '100.64.0.1']) assert.equal(isPublicAddress(ip), false, ip);
  assert.equal(isPublicAddress('8.8.8.8'), true);
});
test('custom feature definitions reject duplicate keys and invalid submitted data', () => {
  const definition = feature();
  assert.deepEqual(featureInput(definition, {quantity: 3}), {quantity: 3});
  assert.throws(() => featureInput(definition, {quantity: '3'}));
  assert.throws(() => featureInput(definition, {quantity: 3, orgId: 'other'}));
  assert.throws(() => featureInput(definition, {}));
  assert.throws(() => featureSchema.parse({...definition, fields: [definition.fields[0], definition.fields[0]]}));
  assert.throws(() => boundedJson({large: 'x'.repeat(65000)}));
});
test('custom JavaScript executes calculations without host capabilities', async () => {
  assert.deepEqual(await runCustomCode(feature().code, {quantity: 4}), {total: 400});
  assert.deepEqual(await runCustomCode('return {process: typeof process, require: typeof require, fetch: typeof fetch};', {}), {process: 'undefined', require: 'undefined', fetch: 'undefined'});
  assert.deepEqual(await runCustomCode('return steps[0].total + input.extra;', {extra: 2}, [{total: 5}]), 7);
  await assert.rejects(runCustomCode('return process.env;', {}));
  await assert.rejects(runCustomCode('while(true) {}', {}), /Custom code failed/);
  await assert.rejects(runCustomCode('return "x".repeat(70000);', {}), /too large/);
  await assert.rejects(runCustomCode('return undefined;', {}), /must return JSON/);
  await assert.rejects(runCustomCode('return Promise.resolve(1);', {}), /Async code/);
});
test('built-in tool catalog exposes bounded provider operations', () => {
  assert.ok(builtinTools.google.some(tool => tool.name === 'gmail_send'));
  assert.ok(builtinTools.google.some(tool => tool.name === 'drive_create_text'));
  assert.ok(builtinTools.notion.some(tool => tool.name === 'notion_create_page'));
  for (const tools of Object.values(builtinTools)) for (const tool of tools) assert.equal(tool.inputSchema.additionalProperties, false);
});

test('Gmail adapter encodes messages and rejects header injection before sending', async t => {
  const requests = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    requests.push({url, options});
    return new Response(JSON.stringify({id: 'message'}), {status: 200});
  });
  await callBuiltin('google', 'test-token', 'gmail_send', {to: 'customer@example.com', subject: 'Your quote', body: 'Total: KES 400'});
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, 'https://www.googleapis.com/gmail/v1/users/me/messages/send');
  assert.equal(requests[0].options.redirect, 'error');
  const mime = Buffer.from(JSON.parse(requests[0].options.body).raw, 'base64url').toString();
  assert.ok(mime.includes('To: customer@example.com\r\n'));
  assert.ok(mime.includes(Buffer.from('Total: KES 400').toString('base64')));
  await assert.rejects(callBuiltin('google', 'test-token', 'gmail_send', {to: 'customer@example.com', subject: 'Subject\r\nBcc: other@example.com', body: 'text'}));
  await assert.rejects(callBuiltin('notion', 'test-token', 'gmail_send', {to: 'customer@example.com', subject: 'Subject', body: 'text'}));
  assert.equal(requests.length, 1);
});
