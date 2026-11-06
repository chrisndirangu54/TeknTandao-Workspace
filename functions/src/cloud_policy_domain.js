// Pure multi-tenant policy and evaluation core. Never execute provider calls here.
const ACTIONS = new Set(['read-metrics','preview-deployment','import-plan','approve-plan','restart-revision','apply-deployment','delete-resource']);
export function authorizeCloudAction(context, action) {
  if (!ACTIONS.has(action)) return {allowed:false,reason:'unknown-action'};
  if (!context || context.actorOrgId !== context.resourceOrgId || !context.memberActive)
    return {allowed:false,reason:'tenant-boundary'};
  if (!['owner','operator','viewer'].includes(context.role)) return {allowed:false,reason:'unknown-role'};
  if (['approve-plan','import-plan'].includes(action) && context.role !== 'owner')
    return {allowed:false,reason:'owner-required'};
  if (context.role === 'viewer' && !['read-metrics','preview-deployment'].includes(action))
    return {allowed:false,reason:'read-only-role'};
  if (['apply-deployment','restart-revision','delete-resource'].includes(action)) {
    if (context.role !== 'owner') return {allowed:false,reason:'owner-required'};
    if (context.customerApproved !== true || context.operatorApproved !== true)
      return {allowed:false,reason:'two-party-approval-required'};
    if (context.approvalExpiresAtMs <= context.nowMs || context.approvalExpiresAtMs - context.nowMs > 3600000)
      return {allowed:false,reason:'approval-expired-or-excessive'};
    if (!context.scopedIdentity || !context.auditEnabled)
      return {allowed:false,reason:'execution-controls-missing'};
    if (action === 'delete-resource') return {allowed:false,reason:'destructive-action-disabled'};
  }
  return {allowed:true,reason:'authorized'};
}
export function evaluateCloudOpsRun({cases=[]}) {
  if (!Array.isArray(cases) || cases.length===0 || cases.length>1000) throw new Error('Invalid evaluation suite');
  let correct=0, violations=0, safeDenials=0;
  for (const item of cases) {
    const decision=authorizeCloudAction(item.context,item.action);
    const expected=Boolean(item.expectAllow);
    if(decision.allowed===expected)correct++;
    if(decision.allowed&&!expected)violations++;
    if(!decision.allowed&&!expected)safeDenials++;
  }
  return {caseCount:cases.length,accuracy:correct/cases.length,
    unsafeAuthorizationRate:violations/cases.length,safeDenialRate:safeDenials/cases.length,
    productionReady:false};
}
