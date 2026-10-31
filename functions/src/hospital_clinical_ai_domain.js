export const clinicalTasks=Object.freeze([
 'clinical_summary','diagnostic_considerations','questions_to_check','lab_review','evidence_review'
]);
export const clinicalModels=Object.freeze({
 'medgemma-1.5-4b':Object.freeze({
   provider:'Google HAI-DEF',model:'MedGemma 1.5 4B',
   card:'https://developers.google.com/health-ai-developer-foundations/medgemma/model-card',
   clinicalApproved:false
 }),
 'medgemma-27b':Object.freeze({
   provider:'Google HAI-DEF',model:'MedGemma 27B',
   card:'https://developers.google.com/health-ai-developer-foundations/medgemma/model-card-v1',
   clinicalApproved:false
 })
});
export function validateHospitalClinicalTask(task){
 if(!clinicalTasks.includes(task))throw new Error('Unsupported clinical support task');
 return task;
}
export function describeClinicalModel(id){
 if(!Object.hasOwn(clinicalModels,id))throw new Error('Unknown research model');
 return clinicalModels[id];
}
export function requireClinicalEvaluation(report){
 if(!['radiology','microscopy','antimicrobial_susceptibility','medgemma_reasoning'].includes(report?.domain))
   throw new Error('Unknown evaluation domain');
 return {domain:report.domain,deployable:false,
   clinicalApproval:false,
   reason:'External evaluation and accountable institutional authorization are mandatory'};
}
