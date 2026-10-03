import {test, after} from 'node:test';
import assert from 'node:assert/strict';
import {getFirestore, Timestamp} from 'firebase-admin/firestore';
import {getApps, deleteApp} from 'firebase-admin/app';
import {createServer} from 'node:http';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';

if (!process.env.FIRESTORE_EMULATOR_HOST || process.env.GCLOUD_PROJECT !== 'demo-tandao') throw new Error('Use the demo-tandao Firestore emulator');
const api = await import('../src/automation_studio.js');
const db = getFirestore();
const orgId = `automation_${Date.now()}`;
const org = db.doc(`organizations/${orgId}`);
const request = (data = {}, uid = 'owner') => ({auth: {uid}, data: {orgId, ...data}});

test('studio enforces owner and paid access, publishes features and prevents duplicate workflows', async () => {
  await org.set({name: 'Automation test'});
  await org.collection('members').doc('owner').set({role: 'owner'});
  await org.collection('members').doc('member').set({role: 'member'});
  await assert.rejects(api.getAutomationStudio.run({data: {orgId}}), /Sign in/);
  await assert.rejects(api.getAutomationStudio.run(request({}, 'member')), /owners/);
  await assert.rejects(api.getAutomationStudio.run(request({}, 'stranger')), /owners/);
  const feature = {name: 'Quote', description: 'Calculate a quote', fields: [{key: 'quantity', label: 'Quantity', type: 'number', required: true}], code: 'return {total: input.quantity * 100};', workflowId: null};
  await assert.rejects(api.saveCustomFeature.run(request({feature})), /paid/);
  await org.collection('apps').doc('crm').set({state: 'trial', expiresAt: Timestamp.fromMillis(Date.now() + 86400000)});
  await assert.rejects(api.saveCustomFeature.run(request({feature})), /paid/);
  await org.collection('apps').doc('crm').update({state: 'paid'});
  const saved = await api.saveCustomFeature.run(request({feature}));
  const featureRun = request({id: saved.id, runId: 'submission', input: {quantity: 4}});
  await assert.rejects(api.runCustomFeature.run(featureRun), /Publish/);
  const preview = await api.previewCustomFeature.run(request({feature, input: {quantity: 4}}));
  assert.deepEqual(preview.result, {total: 400});
  assert.equal((await org.collection('customFeatureRecords').get()).size, 0);
  await api.publishCustomFeature.run(request({id: saved.id}));
  assert.deepEqual((await api.runCustomFeature.run(featureRun)).result, {total: 400});
  await api.runCustomFeature.run(featureRun);
  assert.equal((await org.collection('customFeatureRecords').get()).size, 1);
  await assert.rejects(api.runCustomFeature.run(request({id: saved.id, runId: 'submission', input: {quantity: 5}})), /different input/);

  const workflow = {name: 'Calculate', trigger: 'manual', enabled: true, steps: [{kind: 'code', code: 'return {total: input.quantity * 10};'}]};
  const savedWorkflow = await api.saveToolWorkflow.run(request({workflow}));
  const workflowRequest = request({id: savedWorkflow.id, runId: 'one-run', input: {quantity: 2}});
  await Promise.all([api.runToolWorkflow.run(workflowRequest), api.runToolWorkflow.run(workflowRequest)]);
  const result = await api.runToolWorkflow.run(workflowRequest);
  assert.equal(result.status, 'succeeded');
  assert.deepEqual(result.result, {total: 20});
  assert.equal((await org.collection('toolWorkflowRuns').get()).size, 1);
  await assert.rejects(api.runToolWorkflow.run(request({id: savedWorkflow.id, runId: 'one-run', input: {quantity: 3}})), /different input/);

  const key = await api.createWorkspaceMcpKey.run(request({workflowIds: [savedWorkflow.id]}));
  assert.ok(key.token.startsWith('ttw_'));
  const overview = await api.getAutomationStudio.run(request());
  assert.ok(!JSON.stringify(overview).includes(key.token));
  assert.equal(overview.premium, true);
  const server = createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    req.body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : undefined;
    req.query = Object.fromEntries(new URL(req.url, 'http://localhost').searchParams);
    res.set = (name, value) => { res.setHeader(name, value); return res; };
    res.status = status => { res.statusCode = status; return res; };
    res.send = body => { res.end(body); return res; };
    await api.workspaceMcp(req, res);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const client = new Client({name: 'integration-test', version: '1'});
  try {
    await client.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${server.address().port}/mcp`), {requestInit: {headers: {Authorization: `Bearer ${key.token}`}}}));
    assert.deepEqual((await client.listTools()).tools.map(tool => tool.name), ['list_workflows', 'run_workflow']);
    const listed = await client.callTool({name: 'list_workflows', arguments: {}});
    assert.equal(JSON.parse(listed.content[0].text)[0].id, savedWorkflow.id);
    const remoteRun = await client.callTool({name: 'run_workflow', arguments: {workflowId: savedWorkflow.id, runId: 'mcp-run', input: {quantity: 7}}});
    assert.deepEqual(JSON.parse(remoteRun.content[0].text).result, {total: 70});
    const denied = await client.callTool({name: 'run_workflow', arguments: {workflowId: 'outside-scope', runId: 'other-run', input: {}}});
    assert.equal(denied.isError, true);
    await api.revokeWorkspaceMcpKey.run(request({id: key.id}));
    await assert.rejects(client.listTools());
  } finally {
    await client.close();
    await new Promise(resolve => server.close(resolve));
  }
  assert.equal((await db.doc(`workspaceMcpKeys/${key.id}`).get()).exists, false);

  const failing = await api.saveToolWorkflow.run(request({workflow: {...workflow, steps: [{kind: 'code', code: 'throw new Error("bad input");'}]}}));
  const failRequest = request({id: failing.id, runId: 'failed-run', input: {}});
  assert.equal((await api.runToolWorkflow.run(failRequest)).status, 'needs_review');
  const triggered = await api.saveToolWorkflow.run(request({workflow: {...workflow, trigger: 'sale.created', steps: [{kind: 'code', code: 'return {sale: input.saleId};'}]}}));
  const event = {params: {orgId, eventId: 'sale-one'}, data: {data: () => ({type: 'sale.created', saleId: 'sale-one'})}};
  await api.processOperationalToolEvent.run(event);
  await api.processOperationalToolEvent.run(event);
  const eventRuns = await org.collection('toolWorkflowRuns').where('workflowId', '==', triggered.id).get();
  assert.equal(eventRuns.size, 1);
  assert.deepEqual(eventRuns.docs[0].data().result, {sale: 'sale-one'});
  assert.equal((await api.runToolWorkflow.run(failRequest)).status, 'needs_review');
  await org.collection('apps').doc('crm').update({expiresAt: Timestamp.fromMillis(0)});
  await assert.rejects(api.previewCustomFeature.run(request({feature, input: {quantity: 1}})), /paid/);
  await assert.rejects(api.runToolWorkflow.run(request({id: savedWorkflow.id, runId: 'expired', input: {quantity: 1}})), /paid/);
});

after(async () => { await Promise.all(getApps().map(app => deleteApp(app))); });
