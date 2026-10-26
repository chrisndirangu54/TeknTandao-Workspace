import {workflowSchema} from './automation_domain.js';
export function validateAgentWorkflowDraft(raw,connections){
 if(!Array.isArray(connections)||connections.length>50)throw new Error('Invalid connection inventory');
 const workflow=workflowSchema.parse({...raw,enabled:false,trigger:'manual'});
 if(workflow.steps.some(step=>step.kind!=='tool'))
  throw new Error('AI workflows may not generate executable code');
 const allowed=new Map(connections.filter(c=>c.status==='connected').map(c=>[c.id,new Set((c.tools||[]).map(t=>typeof t==='string'?t:t.name))]));
 for(const step of workflow.steps){
  if(!allowed.get(step.connectionId)?.has(step.tool))
   throw new Error('Agent requested a tool that is not available to this workspace');
 }
 return {...workflow,enabled:false,trigger:'manual'};
}
export function parseAgentWorkflowResponse(body){
 const text=body?.candidates?.[0]?.content?.parts?.map(p=>p.text||'').join('');
 if(typeof text!=='string'||text.length>50000||!text.trim())throw new Error('AI did not return a workflow');
 return JSON.parse(text.replace(/^\\s*```(?:json)?\\s*|\\s*```\\s*$/g,''));
}
