import {lookup} from 'node:dns';
import {randomUUID} from 'node:crypto';
import {Agent, fetch as httpFetch} from 'undici';
import ipaddr from 'ipaddr.js';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {z} from 'zod';
import {boundedJson} from './automation_domain.js';

export function isPublicAddress(address) {
  try { return ipaddr.process(address).range() === 'unicast'; } catch { return false; }
}
export function remoteUrl(raw) {
  const url = new URL(raw);
  if (url.protocol !== 'https:' || url.username || url.password || url.hash || url.search || (url.port && url.port !== '443')) throw new Error('Use a public HTTPS MCP endpoint on port 443, without credentials or query parameters');
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (host === 'localhost' || !host.includes('.') || (ipaddr.isValid(host) && !isPublicAddress(host))) throw new Error('Private MCP endpoints are not supported');
  return url;
}

// Validate addresses inside the socket lookup, so DNS rebinding cannot bypass
// a preflight check. Never follow a redirect with a provider credential.
const dispatcher = new Agent({connect: {lookup(hostname, options, callback) {
  lookup(hostname, {...options, all: true}, (error, addresses) => {
    if (error) return callback(error);
    if (!addresses.length || addresses.some(item => !isPublicAddress(item.address))) return callback(new Error('Private network address blocked'));
    if (options.all) callback(null, addresses);
    else callback(null, addresses[0].address, addresses[0].family);
  });
}}});
export async function remoteFetch(url, options = {}) {
  remoteUrl(String(url));
  const response = await httpFetch(url, {...options, dispatcher, redirect: 'error', signal: options.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(20000)]) : AbortSignal.timeout(20000)});
  // Bound both JSON and streamed MCP responses before handing them to the SDK.
  if (!response.body) return new Response(null, {status: response.status, headers: response.headers});
  let bytes = 0;
  const body = response.body.pipeThrough(new TransformStream({transform(chunk, controller) {
    bytes += chunk.byteLength;
    if (bytes > 1024 * 1024) throw new Error('MCP response is too large');
    controller.enqueue(chunk);
  }}));
  return new Response(body, {status: response.status, headers: response.headers});
}

async function withMcp(connection, credential, work) {
  const client = new Client({name: 'tekntandao-workspace', version: '1.0.0'});
  const endpoint = remoteUrl(connection.url);
  const transport = new StreamableHTTPClientTransport(endpoint, {
    requestInit: {headers: credential.token ? {Authorization: `Bearer ${credential.token}`} : {}},
    fetch: (url, options) => {
      if (new URL(String(url)).origin !== endpoint.origin) throw new Error('Cross-origin MCP request blocked');
      return remoteFetch(url, options);
    },
  });
  try {
    await client.connect(transport, {timeout: 20000});
    return await work(client);
  } finally { await client.close().catch(() => {}); }
}
export async function discoverMcp(connection, credential) {
  return withMcp(connection, credential, async client => {
    const tools = [];
    let pages = 0;
    let cursor;
    do {
      const page = await client.listTools(cursor ? {cursor} : {}, {timeout: 20000});
      tools.push(...page.tools);
      cursor = page.nextCursor;
      pages += 1;
      if (tools.length > 100 || (cursor && (tools.length >= 100 || pages >= 10))) throw new Error('MCP servers are limited to 100 tools and 10 pages per connection');
    } while (cursor);
    return boundedJson(tools, 256000);
  });
}
export async function callMcp(connection, credential, name, args) {
  return withMcp(connection, credential, async client => {
    const result = await client.callTool({name, arguments: args}, undefined, {timeout: 20000});
    if (result.isError) throw new Error('Remote tool reported an error; inspect the provider before retrying');
    return boundedJson(result);
  });
}

const string = {type: 'string'};
const tool = (name, description, properties, required = []) => ({name, description, inputSchema: {type: 'object', properties, required, additionalProperties: false}});
export const builtinTools = {
  google: [
    tool('gmail_search', 'Find Gmail messages', {query: string}, ['query']),
    tool('gmail_read', 'Read a Gmail message', {messageId: string}, ['messageId']),
    tool('gmail_send', 'Send a plain-text email', {to: string, subject: string, body: string}, ['to', 'subject', 'body']),
    tool('drive_search', 'Find Google Drive files authorized for this app', {query: string}),
    tool('drive_create_text', 'Create a text file in Google Drive', {name: string, content: string}, ['name', 'content']),
  ],
  notion: [
    tool('notion_search', 'Search pages shared with this connection', {query: string}),
    tool('notion_create_page', 'Create a child page under a shared page', {parentId: string, title: string, content: string}, ['parentId', 'title', 'content']),
  ],
};
const text = z.string().max(30000);
const schemas = {
  gmail_search: z.object({query: text}).strict(),
  gmail_read: z.object({messageId: z.string().regex(/^[a-zA-Z0-9_-]+$/)}).strict(),
  gmail_send: z.object({to: z.string().email().max(254), subject: z.string().max(300).regex(/^[^\r\n]*$/), body: text}).strict(),
  drive_search: z.object({query: text.optional()}).strict(),
  drive_create_text: z.object({name: z.string().min(1).max(200), content: text}).strict(),
  notion_search: z.object({query: text.optional()}).strict(),
  notion_create_page: z.object({parentId: z.string().regex(/^[a-fA-F0-9-]{32,36}$/), title: z.string().min(1).max(200), content: z.string().max(2000)}).strict(),
};
export async function providerJson(url, options = {}, timeoutMs = 20000) {
  const response = await fetch(url, {...options, redirect: 'error', signal: AbortSignal.timeout(timeoutMs)});
  if (!response.ok) throw new Error(`Connection provider returned HTTP ${response.status}`);
  const reader = response.body.getReader();
  let size = 0;
  const chunks = [];
  try {
    for (;;) {
      const {value, done} = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 1024 * 1024) throw new Error('Provider response is too large');
      chunks.push(Buffer.from(value));
    }
  } finally { await reader.cancel(); }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
export async function callBuiltin(provider, accessToken, name, raw) {
  if (!builtinTools[provider]?.some(item => item.name === name)) throw new Error('Tool is not part of this connection');
  const args = schemas[name].parse(raw);
  const headers = {Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json'};
  const google = (path, options = {}) => providerJson(`https://www.googleapis.com/${path}`, {...options, headers});
  switch (name) {
    case 'gmail_search': return google(`gmail/v1/users/me/messages?maxResults=20&q=${encodeURIComponent(args.query)}`);
    case 'gmail_read': return google(`gmail/v1/users/me/messages/${args.messageId}?format=full`);
    case 'gmail_send': {
      const mime = `To: ${args.to}\r\nSubject: =?UTF-8?B?${Buffer.from(args.subject).toString('base64')}?=\r\nMIME-Version: 1.0\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n${Buffer.from(args.body).toString('base64')}`;
      return google('gmail/v1/users/me/messages/send', {method: 'POST', body: JSON.stringify({raw: Buffer.from(mime).toString('base64url')})});
    }
    case 'drive_search': return google(`drive/v3/files?pageSize=20&fields=files(id,name,mimeType,webViewLink)&q=${encodeURIComponent(args.query || 'trashed = false')}`);
    case 'drive_create_text': {
      const boundary = 'tekntandao_' + randomUUID();
      return providerJson('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {method: 'POST', headers: {...headers, 'Content-Type': `multipart/related; boundary=${boundary}`}, body: `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({name: args.name, mimeType: 'text/plain'})}\r\n--${boundary}\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\n${args.content}\r\n--${boundary}--`});
    }
    case 'notion_search': return providerJson('https://api.notion.com/v1/search', {method: 'POST', headers: {...headers, 'Notion-Version': '2026-03-11'}, body: JSON.stringify({query: args.query || '', page_size: 20})});
    case 'notion_create_page': return providerJson('https://api.notion.com/v1/pages', {method: 'POST', headers: {...headers, 'Notion-Version': '2026-03-11'}, body: JSON.stringify({parent: {page_id: args.parentId}, properties: {title: {type: 'title', title: [{type: 'text', text: {content: args.title}}]}}, children: [{object: 'block', type: 'paragraph', paragraph: {rich_text: [{type: 'text', text: {content: args.content}}]}}]})});
    default: throw new Error('Unknown tool');
  }
}
