export const executiveSections=Object.freeze(['finance','sales','inventory','hr']);
export function executiveBriefingFacts(sections,requested){
 if(!Array.isArray(requested)||!requested.length||requested.some(s=>!executiveSections.includes(s))||new Set(requested).size!==requested.length)
  throw new Error('Invalid executive briefing sections');
 const included={},coverage={};
 for(const name of requested){
  const data=sections[name];
  if(!data||data.available!==true){coverage[name]={available:false,reason:data?.reason||'unavailable'};continue;}
  if(data.complete!==true){coverage[name]={available:false,reason:'incomplete_snapshot'};continue;}
  included[name]=data.facts;
  coverage[name]={available:true,recordCount:data.recordCount};
 }
 return {sections:included,coverage,complete:requested.every(name=>coverage[name].available),
  readOnly:true,disclaimer:'Internal operational evidence only; no unverified revenue, cash, attendance compliance or purchasing claims.'};
}
