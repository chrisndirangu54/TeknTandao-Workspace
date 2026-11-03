// Pure state machine for permissioned, two-person foundation approvals.
// Workflow approvals do NOT invoke money, clinical, or external operations.
export const APPROVAL_KINDS = Object.freeze(['data_migration','module_activation','connector_enablement']);
export function approvalInput(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input) ||
      Object.keys(input).some(k=>!['kind','summary','targetId'].includes(k)))
    throw new Error('Invalid approval input');
  if (!APPROVAL_KINDS.includes(input.kind)) throw new Error('Invalid approval kind');
  if (typeof input.summary!=='string'||input.summary.trim().length<8||input.summary.length>500)
    throw new Error('Invalid approval summary');
  if (typeof input.targetId!=='string'||!/^[A-Za-z0-9_-]{1,100}$/.test(input.targetId))
    throw new Error('Invalid target identifier');
  return {kind:input.kind,summary:input.summary.trim(),targetId:input.targetId};
}
export function approvalDecision(current,{actorUid,decision,nowMs=Date.now()}) {
  if (!current || current.status!=='pending') throw new Error('Approval is not pending');
  if (current.createdBy===actorUid) throw new Error('Self approval prohibited');
  if (!['approved','rejected'].includes(decision)) throw new Error('Invalid decision');
  if (!Number.isFinite(nowMs)||nowMs>=Date.parse(current.expiresAt))
    throw new Error('Approval has expired');
  return {status:decision,decidedBy:actorUid};
}
export function migrationAssessment({scanned,missingName,externalReferences,cap}) {
  if(!Number.isInteger(scanned)||!Number.isInteger(missingName)||!Number.isInteger(externalReferences))
    throw new Error('Invalid migration assessment');
  return {scanned,missingName,externalReferences,
    capped:scanned>=cap,readyForAutomaticMigration:false,
    nextStep:'Review source records, tenant ownership, duplicates and field mappings manually'};
}
