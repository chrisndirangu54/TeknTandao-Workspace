import test from 'node:test';
import assert from 'node:assert/strict';
import {validateAgentWorkflowDraft,parseAgentWorkflowResponse} from '../src/prompt_workflow_agent_domain.js';
const connections=[{id:'workspace_tool',status:'connected',tools:['list_records']}];
const draft={name:'Daily pipeline brief',description:'Read CRM records',trigger:'manual',enabled:true,
 steps:[{kind:'tool',connectionId:'workspace_tool',tool:'list_records',arguments:{}}]};
test('agent workflow draft is always manual and disabled',()=>{
 const validated=validateAgentWorkflowDraft(draft,connections);
 assert.equal(validated.enabled,false);
 assert.equal(validated.trigger,'manual');
 assert.equal(validated.steps[0].tool,'list_records');
});
test('agent may not call unknown tools, disconnected tools, or generate code',()=>{
 assert.throws(()=>validateAgentWorkflowDraft({...draft,steps:[{...draft.steps[0],tool:'delete_all'}]},connections));
 assert.throws(()=>validateAgentWorkflowDraft(draft,[{...connections[0],status:'disconnected'}]));
 assert.throws(()=>validateAgentWorkflowDraft({...draft,steps:[{kind:'code',code:'return input'}]},connections));
});
test('response parsing rejects empty completions',()=>{
 assert.throws(()=>parseAgentWorkflowResponse({candidates:[]}));
 assert.equal(parseAgentWorkflowResponse({candidates:[{content:{parts:[{text:JSON.stringify(draft)}]}}]}).name,'Daily pipeline brief');
});
