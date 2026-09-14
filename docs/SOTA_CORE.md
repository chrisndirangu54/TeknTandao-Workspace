# SOTA Business OS Core

This layer moves TeknTandao from a large catalogue of operational apps toward an interconnected business operating system. It deliberately prioritizes shared primitives over adding more app names.

## 1. Business Graph

`upsertBusinessGraphNode`, `linkBusinessGraphNodes` and `queryBusinessGraph` create an organization-scoped graph connecting customers, suppliers, employees, products, orders, invoices, payments, assets, contracts, projects, properties, locations, shipments, vehicles, mining sites/samples/equipment, tasks and AI agents.

Graph nodes and edges retain their source app. Direct Firestore reads are owner-only because a graph can join data across app boundaries; application members must go through authorized callable APIs.

The Flutter SOTA Control Center now exposes graph creation, linking and relationship inspection so this capability is no longer backend-only.

## 2. Durable Event Bus and Automation Engine

`publishBusinessEvent` accepts validated, scalar event payloads with optional idempotency keys. `processBusinessEvent` consumes organization event-bus records and evaluates owner-created rules from `automationRules`.

The safe automation action set is intentionally allow-listed:

- `createRecord` in an installed target app,
- `createTask` in CRM,
- `graphLink` between existing graph node identifiers,
- `emitEvent` for chained workflows.

Rules support equality, inequality, numeric comparisons and existence conditions. Chained events are capped at depth three to reduce runaway loops. Dedicated financial/tax flows (`pos`, `accounting`, `payments`, `etims`) cannot be bypassed by generic automation record writes.

The Business Process Marketplace now has installable, versioned starter processes for retail replenishment, property maintenance dispatch, logistics delivery follow-up, mining sample review and e-commerce follow-up. Required apps must be active before a template can be installed. The Control Center also exposes a bounded custom-rule builder. Arbitrary code execution and arbitrary outbound webhooks remain deliberately disabled.

## 3. Agent Control Plane and Safe Execution Runtime

`saveAgentPolicy` stores an explicit policy per agent:

- allowed applications,
- allowed action names,
- actions requiring human approval,
- active/disabled state,
- monthly cost budget.

`requestAgentAction` evaluates the policy, current monthly usage and requested cost. Requests can be blocked, sent to human approval or issued a five-minute permit. `approveAgentAction` is owner-only, and `recordAgentUsage` maintains the monthly cost ledger. Every request is written to the agent audit trail.

`executeAgentAction` now consumes a valid permit and can execute only four idempotent internal actions:

- `record.create`,
- `task.create`,
- `event.publish`,
- `graph.upsert`.

Execution uses deterministic IDs, writes execution receipts and consumes the permit after success. The current policy and budget are rechecked before execution. Payments, tax filing and other regulated actions are not part of this generic executor and therefore cannot be reached by simply granting an arbitrary action name.

The Control Center exposes agent policy creation plus human approve/reject queues.

## 4. Offline / Edge Synchronization

`syncOfflineBatch` accepts 1–25 idempotent mutations at a time. Each mutation has:

- a stable `mutationId`,
- a `recordId`,
- the device's `baseVersion`,
- a validated scalar record payload.

The server uses optimistic version checks. A stale device receives a conflict receipt rather than silently overwriting newer data. Successful mutations increment the server version, create a durable sync receipt and publish an event into the shared event bus.

`resolveSyncConflict` adds explicit owner-controlled reconciliation. The owner can keep the server version or deliberately apply a reviewed client record, which creates a new server version. Dedicated POS/accounting/payment/eTIMS mutation paths remain blocked from generic offline writes until their transaction-specific offline protocols are implemented.

## 5. Deep Vertical Operating Packs

The first five operating packs are exposed through `getVerticalOperatingPacks`:

- Retail — POS, inventory, procurement, accounting, CRM and e-commerce.
- SACCO — members, savings/loans, payments, accounting and CRM.
- Property — property, CRM, accounting, payments and field service.
- Mining — mining operations/intelligence, inventory, procurement, fleet and accounting.
- Logistics — freight, fleet, inventory, accounting, payments and cross-border trade.

Each pack declares its canonical graph entities, business events, recommended cross-app automations and whether offline operation is critical. These packs are a contract for progressively replacing generic CRUD depth with specialist workflows.

## 6. AI FinOps

`saveAiFinOpsBudget`, `recordAiUsage` and `getAiFinOpsSummary` provide a provider-neutral cost ledger for AI use. The ledger tracks provider, model, app, operation, input/output/cached tokens and cost in minor currency units, with idempotent provider request IDs, monthly budgets and warning thresholds.

The Control Center shows request counts, token volumes, provider spend, budget consumption and remaining budget. Usage data must come from verified provider adapters or trusted server-side ingestion; the product does not fabricate live provider billing data.

## 7. African Rails Production Gates

`getAfricanRailsReadiness` exposes an honest release boundary:

- M-Pesa subscription billing: implemented when production Daraja credentials are configured.
- Paystack subscription billing: implemented when production credentials are configured.
- M-Pesa merchant checkout: blocked until production merchant credentials plus reconciliation, refund, reversal and dispute handling are complete.
- KRA eTIMS fiscalization: blocked until certified OSCU/VSCU configuration, taxpayer/device provisioning and KRA acceptance testing are complete.
- Airtel Money and multi-country tax: catalogue-level until provider-specific production settlement/certification work is implemented.

The Control Center renders these gates directly. No UI label or catalogue entry should override them.

## 8. Control Plane UI

The following catalogue modules now route to a shared production Control Center instead of generic CRUD screens:

- Business Graph,
- Business Process Marketplace,
- Agent Control Center,
- AI FinOps & Model Cost Manager,
- Autonomous Operations Center.

The UI provides six operational views: overview/readiness, graph, automations/process marketplace, agents/approvals, AI FinOps and offline sync reconciliation. Direct Firestore control-plane reads remain owner-only.

## Security model

All client writes remain denied by Firestore rules. Cross-app control-plane collections (`businessGraph*`, `eventBus`, `automation*`, `agents`, approvals/permits/executions/audit/usage, AI usage/config and sync receipts) are owner-only for direct reads. Callable functions perform membership, entitlement and owner checks before server-side mutation.

Safe agent execution is deliberately narrower than agent policy vocabulary: an organization can describe future/custom actions in policy, but the generic executor recognizes only the explicitly allow-listed internal actions above. This prevents a policy string such as `payment.send` or `tax.file` from becoming executable without a dedicated, reviewed implementation.

## What this does not claim

This foundation materially improves TeknTandao's architecture, but it does **not** by itself make every one of the 653 catalogue products state-of-the-art. Specialist depth still has to be built and validated vertically, and regulated/provider-dependent integrations still require real credentials, certification, reconciliation and operational controls.

The remaining hard external boundaries include production merchant M-Pesa operations, certified KRA eTIMS fiscal issuance, Airtel Money settlement, jurisdiction-specific tax engines and audited KMS/HSM-backed secret storage. Deep industry engines such as full EMR/FHIR, core banking, advanced MRP, SIEM/SOC, IoT protocol management and TerraForge-grade geoscience intelligence also remain separate implementation tranches.
