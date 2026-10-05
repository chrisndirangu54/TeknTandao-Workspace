const clamp = (n, min, max) => Math.min(max, Math.max(min, Number(n) || 0));

export const riskTiers = Object.freeze({
  low: {requiresApproval: false, maxAutonomousSteps: 8},
  medium: {requiresApproval: false, maxAutonomousSteps: 5},
  high: {requiresApproval: true, maxAutonomousSteps: 3},
  regulated: {requiresApproval: true, maxAutonomousSteps: 1}
});

export function normalizeObjective(input = {}) {
  const title = String(input.title || input.goal || '').trim();
  if (!title) throw new Error('objective title is required');
  const successCriteria = Array.isArray(input.successCriteria)
    ? input.successCriteria.map(String).map(v => v.trim()).filter(Boolean).slice(0, 20)
    : [];
  const constraints = Array.isArray(input.constraints)
    ? input.constraints.map(String).map(v => v.trim()).filter(Boolean).slice(0, 20)
    : [];
  return {
    id: String(input.id || '').trim() || null,
    title: title.slice(0, 240),
    successCriteria,
    constraints,
    priority: clamp(input.priority ?? 50, 0, 100),
    risk: Object.hasOwn(riskTiers, input.risk) ? input.risk : 'medium'
  };
}

export function buildPlan(objectiveInput, candidateSteps = []) {
  const objective = normalizeObjective(objectiveInput);
  const tier = riskTiers[objective.risk];
  const steps = candidateSteps
    .map((step, index) => ({
      id: String(step.id || `step_${index + 1}`),
      role: String(step.role || 'operator'),
      action: String(step.action || '').trim(),
      appId: step.appId ? String(step.appId) : null,
      dependsOn: Array.isArray(step.dependsOn) ? step.dependsOn.map(String) : [],
      risk: Object.hasOwn(riskTiers, step.risk) ? step.risk : objective.risk,
      expectedEvidence: Array.isArray(step.expectedEvidence) ? step.expectedEvidence.map(String) : []
    }))
    .filter(step => step.action)
    .slice(0, tier.maxAutonomousSteps);

  const seen = new Set();
  for (const step of steps) {
    if (seen.has(step.id)) throw new Error(`duplicate plan step id: ${step.id}`);
    seen.add(step.id);
    if (step.dependsOn.some(dep => dep === step.id)) throw new Error('step cannot depend on itself');
  }

  return {
    objective,
    steps,
    requiresApproval: tier.requiresApproval || steps.some(s => riskTiers[s.risk].requiresApproval),
    bounded: candidateSteps.length > steps.length,
    maxSteps: tier.maxAutonomousSteps
  };
}

export function readySteps(plan, executionState = {}) {
  const completed = new Set(executionState.completed || []);
  const failed = new Set(executionState.failed || []);
  return plan.steps.filter(step =>
    !completed.has(step.id) &&
    !failed.has(step.id) &&
    step.dependsOn.every(dep => completed.has(dep))
  );
}

export function evaluateStepResult(step, result = {}) {
  const evidence = Array.isArray(result.evidence) ? result.evidence.map(String) : [];
  const expected = step.expectedEvidence || [];
  const evidenceCoverage = expected.length === 0
    ? 1
    : expected.filter(item => evidence.includes(item)).length / expected.length;
  const confidence = clamp(result.confidence ?? 0, 0, 1);
  const policyPassed = result.policyPassed !== false;
  const toolSucceeded = result.toolSucceeded === true;
  const score = (evidenceCoverage * 0.4) + (confidence * 0.3) + (policyPassed ? 0.2 : 0) + (toolSucceeded ? 0.1 : 0);
  return {
    score: Number(score.toFixed(4)),
    evidenceCoverage: Number(evidenceCoverage.toFixed(4)),
    confidence,
    policyPassed,
    toolSucceeded,
    accepted: policyPassed && toolSucceeded && score >= 0.7
  };
}

export function critiquePlan(plan, stepResults = {}) {
  const evaluations = plan.steps.map(step => ({
    stepId: step.id,
    ...evaluateStepResult(step, stepResults[step.id] || {})
  }));
  const accepted = evaluations.filter(v => v.accepted).length;
  const meanScore = evaluations.length
    ? evaluations.reduce((sum, v) => sum + v.score, 0) / evaluations.length
    : 0;
  return {
    acceptedSteps: accepted,
    totalSteps: evaluations.length,
    completionRate: evaluations.length ? accepted / evaluations.length : 0,
    meanScore: Number(meanScore.toFixed(4)),
    needsReflection: evaluations.some(v => !v.accepted),
    evaluations
  };
}

export function orchestrationDecision(plan, critique, executionState = {}) {
  if (plan.requiresApproval && !executionState.approved) return {state: 'awaiting_approval'};
  if (critique.totalSteps > 0 && critique.completionRate === 1) return {state: 'completed'};
  if ((executionState.reflectionCount || 0) >= 2) return {state: 'escalate_human'};
  if (critique.needsReflection) return {state: 'reflect_and_replan'};
  return {state: 'execute'};
}
