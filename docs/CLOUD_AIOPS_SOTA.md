# Cloud AIOps — SOTA-oriented architecture and evaluation

This design follows the Microsoft Azure Well-Architected Framework (reliability, security, cost optimization, operational excellence, performance efficiency) and the Microsoft Foundry Agent Service concepts of agent runtime, governed tools, tracing, and evaluation.

## Control plane
Customer → HTML / Flutter Workspace → Firebase Auth → tenant-scoped API → request state machine → policy check → customer approval → operator approval → scoped cloud executor → observation and audit trail.

### Agents and responsibilities
1. Planner: read-only repo inventory; outputs a versioned infrastructure proposal and cost envelope.
2. Reviewer: checks policy, billing risk, affected resources, data residency, and rollback.
3. Executor: **never** takes arbitrary LLM-generated shell commands; only invokes typed allowlisted operations with short-lived credentials and approvals.
4. Observer: collects metrics, deployment outcomes, incident evidence and costs, using tenant-scoped queries.
5. FinOps reviewer: reconciles distributor invoices against provider usage, flags anomalies, and drafts charge explanations.
6. Critic: compares expected vs observed operation effects and escalates deviations.

The implementation now has a pure policy evaluator (`functions/src/cloud_policy_domain.js`) and unit tests. It deliberately refuses cross-tenant operations, requires two-party approval for production writes, and prohibits resource deletion.

**Important limitation:** the policy module is not yet wired to all Firebase callables, workflow dispatch, or external Azure IAM. The new policy is a foundation, not proof that existing code is protected end to end.

## State and resilience objectives
- Event envelope: organization, request ID, operation ID, actor, purpose, observed revision, risk class, approval record, idempotency key, timestamp.
- States: proposed → validated → awaiting customer approval → awaiting operator approval → queued → running → verifying → succeeded / failed / rollback requested.
- Retries with exponential backoff and bounded deadlines; dead-letter queue for exhausted retries.
- Idempotency keys and monotonic revision checks; compensating action on partial failure.
- Separate control-plane identity from each customer execution identity.
- Secret isolation, audit logs and access reviews for each connected customer.

## Evaluation gates (targets, not achieved results)
- 0 cross-tenant grants in the security test suite; add adversarial cases.
- 0 unauthorized destructive writes in staging; apply external IAM deny policies too.
- ≥ 99% correct policy decisions on versioned, balanced scenarios.
- ≥ 95% accepted deployment-plan proposals in human-verified test cases.
- ≤ 5% false-positive incident alerts on labelled test fixtures.
- Deployment rollback success ≥ 99% in controlled failure injection.
- 100% production writes have an approval record and audit event.
- Measure cloud spend per managed customer, MTTR, deployment lead time, change-failure rate, and restore success.

## Release gates
1. Run Node, Firestore emulator, Flutter, Bicep and GitHub Actions validation.
2. Add authenticated data reconciliation and consent-driven migration.
3. Integrate Foundry or an equivalent governed agent runtime with redacted tool traces, evaluations, version pinning, model fallbacks and isolated customer tools.
4. Wire policy checks both inside the API and on the execution worker; use Azure IAM as independent enforcement.
5. Execute failure injection against sandbox customer subscriptions, prove backups and rollback.
6. Obtain explicit customer/dealer approval and verify cost ceilings before live deployment.

Current stage: **SOTA-oriented engineering**, not demonstrated state of the art. Measurable benchmark evidence and production readiness are outstanding.
