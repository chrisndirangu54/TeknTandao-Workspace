// AI output is advisory prose only. Validated catalog selections, pricing,
// eligibility and activation status always come from the deterministic backend.
export function sanitizeResellerAiNarrative(value){
 if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Invalid AI response');
 const fields=['summary','discoveryQuestions','implementationSteps','risks'];
 if(Object.keys(value).some(k=>!fields.includes(k)))throw new Error('Unexpected AI output');
 const text=(x,max)=>typeof x==='string'&&x.trim().length>0&&x.length<=max;
 if(!text(value.summary,1200))throw new Error('Invalid summary');
 const list=(xs)=>Array.isArray(xs)&&xs.length>=1&&xs.length<=8&&xs.every(x=>text(x,320));
 if(!list(value.discoveryQuestions)||!list(value.implementationSteps)||!list(value.risks))
  throw new Error('Invalid AI advice lists');
 return {summary:value.summary.trim(),discoveryQuestions:value.discoveryQuestions.map(x=>x.trim()),
  implementationSteps:value.implementationSteps.map(x=>x.trim()),risks:value.risks.map(x=>x.trim()),
  advisoryOnly:true};
}
export function extractResellerAiNarrative(result){
 const output=result?.candidates?.[0]?.content?.parts?.map(p=>p.text||'').join('')||'';
 if(!output||output.length>14000)throw new Error('AI did not return a bounded response');
 return sanitizeResellerAiNarrative(JSON.parse(output));
}
