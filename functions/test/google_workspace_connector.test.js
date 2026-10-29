import test from 'node:test';
import assert from 'node:assert/strict';
import {builtinTools,callBuiltin} from '../src/automation_connectors.js';
test('Google Workspace exposes identity plus bounded productivity tools',()=>{
 const names=new Set(builtinTools.google.map(tool=>tool.name));
 for(const name of ['google_profile','gmail_search','gmail_send','drive_search',
  'calendar_list_events','sheets_read','docs_get','slides_get'])assert.ok(names.has(name));
 for(const tool of builtinTools.google)assert.equal(tool.inputSchema.additionalProperties,false);
});
test('Google identity tool rejects arbitrary arguments without network access',async()=>{
 await assert.rejects(callBuiltin('google','dummy','google_profile',{token:'injection'}));
 await assert.rejects(callBuiltin('google','dummy','unlisted_admin_directory',{}));
});
