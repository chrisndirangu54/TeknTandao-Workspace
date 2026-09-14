# SOTA Business OS Core

This layer moves TeknTandao from a large catalogue of operational apps toward an interconnected business operating system. It deliberately prioritizes shared primitives over adding more app names.

## 1. Business Graph

`upsertBusinessGraphNode`, `linkBusinessGraphNodes` and `queryBusinessGraph` create an organization-scoped graph connecting customers, suppliers, employees, products, orders, invoices, payments, assets, contracts, projects, properties, locations, shipments, vehicles, mining sites/samples/equipment, tasks and AI agents.

Graph nodes and edges retain their source app. Direct Firestore reads are owner-only because a graph can join data across app boundaries; application members must go through authorized callable APIs.

## 2. Durable Event Bus and Automation Engine

`publishBusinessEvent` accepts validated, scalar event payloads with optional idempotency keys. `processBusinessEvent` consumes organization event-bus records and evaluates owner-created rules from `automationRules`.

The first safe automation action set is intentionally allow-listed:

- `createRecord` in an installed target app,
- `createTask` in CRM,
- `graphLink` between existing graph node identifiers,
- `emitEvent` for chained workflows.

Rules support equality, inequality, numeric comparisons and existence conditions. Chained events are capped at depth three to reduce runaway loops. Dedicated financial/tax flows (`pos`, `accounting`, `payments`, `etims`) cannot be bypassed by generic automation record writes.

This is the backend foundation for the visual workflow editor / Business Process Marketplace. Arbitrary code execution and arbitrary outbound webhooks are deliberately not enabled.

## 3. Agent Control Plane

`saveAgentPolicy` stores an explicit policy per agent:

- allowed applications,
- allowed action names,
- actions requiring human approval,
- active/disabled state,
- monthly cost budget.

`requestAgentAction` evaluates the policy, current monthly usage and requested cost. Requests can be blocked, sent to human approval or issued a five-minute permit. `approveAgentAction` is owner-only, and `recordAgentUsage` maintains the monthly cost ledger. Every request is written to the agent audit trail.

The permit is a governance primitive for future server-side agent tools. A permit does not itself execute a payment, tax filing or other regulated action.

## 4. Offline / Edge Synchronization

`syncOfflineBatch` accepts 1–25 idempotent mutations at a time. Each mutation has:

- a stable `mutationId`,
- a `recordId`,
- the device's `baseVersion`,
- a validated scalar record payload.

The server uses optimistic version checks. A stale device receives a conflict receipt rather than silently overwriting newer data. Successful mutations increment the server version, create a durable sync receipt and publish an event into the shared event bus.

Dedicated POS/accounting/payment/eTIMS mutation paths remain blocked from generic offline writes until their transaction-specific offline protocols are implemented.

## 5. Deep Vertical Operating Packs

The first five operating packs are exposed through `getVerticalOperatingPacks`:

- Retail — POS, inventory, procurement, accounting, CRM and e-commerce.
- SACCO — members, savings/loans, payments, accounting and CRM.
- Property — property, CRM, accounting, payments and field service.
- Mining — mining operations/intelligence, inventory, procurement, fleet and accounting.
- Logistics — freight, fleet, inventory, accounting, payments and cross-border trade.

Each pack declares its canonical graph entities, business events, recommended cross-app automations and whether offline operation is critical. These packs are a contract for progressively replacing generic CRUD depth with specialist workflows.

## 6. African Rails Production Gates

`getAfricanRailsReadiness` exposes an honest release boundary:

- M-Pesa subscription billing: implemented when production Daraja credentials are configured.
- Paystack subscription billing: implemented when production credentials are configured.
- M-Pesa merchant checkout: blocked until production merchant credentials plus reconciliation, refund, reversal and dispute handling are complete.
- KRA eTIMS fiscalization: blocked until certified OSCU/VSCU configuration, taxpayer/device provisioning and KRA acceptance testing are complete.
- Airtel Money and multi-country tax: catalogue-level until provider-specific production settlement/certification work is implemented.

No UI label or catalogue entry should override these gates.

## Security model

All client writes remain denied by Firestore rules. Cross-app control-plane collections (`businessGraph*`, `eventBus`, `automation*`, `agents`, approvals/permits/audit/usage and sync receipts) are owner-only for direct reads. Callable functions perform membership, entitlement and owner checks before server-side mutation.

## What this does not claim

This foundation materially improves TeknTandao's architecture, but it does **not** by itself make every one of the 653 catalogue products state-of-the-art. Specialist depth still has to be built and validated vertically, and regulated/provider-dependent integrations still require real credentials, certification, reconciliation and operational controls.
