# Agentic Business OS — SOTA Upgrade

This tranche adds measurable agentic and decision-intelligence primitives without weakening TeknTandao's existing tenancy, RBAC, approval, payment or tax boundaries.

## New runtime primitives

### Planner → Executor → Critic
`agentic_orchestration_domain.js` provides bounded objective normalization, risk-tiered plan limits, dependency-aware ready-step selection, evidence-based step evaluation, critic scoring and explicit escalation states.

Regulated objectives are approval-bound and restricted to one autonomous planning step. The generic planner does **not** make payments, file taxes or bypass the existing Agent Control Center.

### Temporal business memory
`temporal_intelligence_domain.js` provides normalized event memory, recency decay, entity/tag relevance ranking and trend estimation. It is intentionally storage-agnostic so the platform can persist memories behind organization-scoped APIs without coupling reasoning code to one database.

### Process intelligence
`process_intelligence_domain.js` implements directly-follows graph discovery, conformance fitness and bottleneck analysis. This lets TeknTandao compare observed workflows with reference processes and quantify where work stalls or deviates.

### Decision intelligence
`decision_intelligence_domain.js` adds deterministic forecasting, anomaly scoring, reorder recommendations and scenario scoring. These are explainable baselines that can be compared against learned models later.

### Business digital twin
`digital_twin_domain.js` adds a bounded operational simulator for inventory, demand, cash, receivables and payables. It is a simulation primitive, not an accounting ledger and not a replacement for server-authoritative financial workflows.

### Agent evaluation and observability
`agent_benchmark_domain.js` measures task completion, safe success, policy violations, hallucinations, tool errors, human interventions, latency and cost. It also exposes trace-span normalization suitable for later OpenTelemetry export.

## SOTA claim policy

TeknTandao should use **SOTA-oriented architecture** until benchmark evidence demonstrates superiority on defined tasks. A feature count, catalogue size or model brand is not evidence of state of the art.

A release can graduate a capability to **benchmark-validated** only when:

1. the scenario suite is versioned;
2. baseline and candidate runs use equivalent inputs;
3. safe-success rate does not regress;
4. policy-violation rate is zero for high-risk benchmark scenarios;
5. quality, cost and latency deltas are reported;
6. external/provider-dependent capabilities are separately verified.

## Benchmark metrics

- task completion rate
- safe-success rate
- policy-violation rate
- hallucination rate
- tool-selection/tool-execution error rate
- human-intervention count
- end-to-end latency
- cost per completed workflow
- process-conformance fitness
- recovery after failed tool execution

## Next integration layer

The pure domain functions deliberately land before storage/callable wiring. Production integration should:

- persist temporal memories under organization scope;
- emit trace spans from existing callable/agent execution paths;
- feed process mining from the durable event bus;
- store benchmark run artifacts immutably by suite/version;
- route planner proposed actions through the current Agent Control Center permit/approval system;
- keep payments, tax, payroll posting and other regulated effects on dedicated reviewed pathways.
