# Phase 1 Foundation — implementation status

**Branch:** `feat/phase1-foundation`. This is an additive Firebase-native foundation increment. Production is unchanged until reviewed, merged and deployed.

## Current architecture
The existing TeknTandao Workspace is Flutter + Firebase Auth + Cloud Functions + Firestore. Canonical identity, module entitlements and tenant data live under `organizations/{orgId}`; introducing PostgreSQL/Keycloak/Temporal/NATS at this stage would require a separate migration decision. Do not move existing hospital, payroll, financial, or other regulated data without explicit data classification, backfill and reconciliation.

## Implemented
- `foundationCreateParty`, `foundationGetParty`, `foundationListParties`: authenticated, tenant-authorized enterprise party operations; admin/owner writes only, bounded list reads; strict field validation.
- `foundationCreateBranch`, `foundationListBranches`: organization-scoped operational branch directory and idempotent creation.
- A party creation transaction atomically creates the canonical party, audit record, pending outbox event and idempotency receipt.
- `foundationOutboxCreated` routes the event into the existing `organizations/{orgId}/eventBus` event bus using a deterministic ID. The bus document, delivery receipt and outbox status are committed atomically; repeated trigger execution cannot create a second event.
- `foundationOutboxRecovery` runs every five minutes to attempt bounded recovery of pending events. A collection-group index is included in `firestore.indexes.json`.
- `foundationOutboxStatus` returns owner/admin-only, bounded pending and delivered counts (samples, **not** full analytics).
- Pure-domain validation tests, Firestore security-rules regression tests and emulator delivery/concurrency/tenant-mismatch tests. CI runs emulator verification.

## Delivery semantics and safeguards
The relay guarantees transactional, idempotent creation of **one Firestore eventBus document** per foundation outbox event. It does not guarantee exactly-once downstream business actions. The existing `processBusinessEvent` trigger executes automations separately, and its own replay, failure and idempotency behavior must be assessed before relying on it for financial or clinical side effects.

Events contain only party IDs, not patient, payroll, employee or customer narrative information. A trusted server fetch with tenant-scoped checks is required to resolve details.

Outbox recovery processes at most 100 pending events per execution; inspect logs for `moreMayRemain` and alert on excessive backlog. Malformed events remain pending for investigation. Schedule operations and Firestore reads incur cloud costs. No external connector, payment action, model call or clinical action is automatically executed by the new foundation endpoints.

## Firestore paths
All are directly inaccessible to clients through the existing rules; write access is exclusively via Admin SDK Cloud Functions:
- `organizations/{orgId}/enterpriseParties/{partyId}`
- `organizations/{orgId}/foundationBranches/{branchId}`
- `organizations/{orgId}/foundationOutbox/{eventId}`
- `organizations/{orgId}/foundationInbox/{eventId}`
- `organizations/{orgId}/foundationIdempotency/{keyDigest}`
- `organizations/{orgId}/foundationAudit/{auditId}`

## Local verification
```bash
npm --prefix functions ci
npm --prefix functions test
npm run test:rules
npx firebase emulators:exec --project demo-tandao --only firestore "node --test functions/test/foundation_emulator.test.js"
```

## Before enabling in production
1. Review CI + emulator output, and conduct an authorization review of all Cloud Functions.
2. Verify deployment grants, index status, quota/retention policy, trigger region and scheduled-function billing.
3. Set alerts for `foundation.outbox.delivery_failed`, `foundation.outbox.recovery` backlog, trigger failures and queue age.
4. Validate real tenant onboarding and legacy organization migration with a rehearsal. The new branch directory does **not** change legacy branch semantics.
5. Verify Firestore backup/PITR and restore in an isolated project, recording achieved RPO/RTO.
6. Verify data retention, audit immutability protections and incident response.
7. Run load and chaos tests, apply quota limits, and roll out under a disabled-by-default feature flag to a test tenant.
8. Do not merge into production until security review and canary tests pass.

## Still outstanding from Phase 1
- Canonical global party federation / multi-organization ownership and full migration of current contacts and roles.
- Enterprise OIDC provider decision, privileged MFA posture and central policy engine where justified.
- A complete workflow engine with approval/compensation steps beyond the existing Workspace automation.
- End-to-end telemetry aggregation (OpenTelemetry, metrics, tracing, alert routing).
- Fully automated infrastructure provisioning and independently tested disaster recovery.
- Independent security audit, performance baseline, production SLO acceptance.

**Status:** Draft PR implementation, not a completed or production-certified foundation.

## Governance and migration safeguards (second increment)
- `foundationRequestApproval` creates 24-hour expiring approval requests for `data_migration`, `module_activation`, and `connector_enablement` plans. Requester must be an owner.
- `foundationDecideApproval` requires a different, currently authorized owner to approve or reject; transactions prevent double decisions and append a tenant-local audit record.
- These decisions are **records only**, not automatic operations. A separate authorized executor, change control and operational validation will be needed before activation.
- `foundationListApprovals` provides a 50-record bounded owner-only governance listing.
- `foundationAssessLegacyContacts` samples up to 200 source contacts, reports name/external-reference statistics, and performs **zero writes**; it neither exports personal information nor determines final migration eligibility.
- `foundationOperationalReadiness` provides owner-only 50-record bounded samples for pending/delivered events, pending approvals, and party records, with a warning on backlog age >600 seconds or >=50 pending. It is not a whole-service observability system.
- Foundation membership checks now deny invited, suspended, revoked and disabled accounts. Existing legacy memberships with no status field remain compatible.

## Recovery runbook (manual verification required)
1. Confirm that Firestore point-in-time recovery or scheduled backup coverage is enabled in the actual deployed Google Cloud project; inspect retention and IAM.
2. Restore a snapshot into a separate, access-restricted test project or database. Never overwrite live data during a drill.
3. Compare document counts and sampled integrity hashes for organizations, members, parties, branches, outbox receipts, and audit records; exclude PII from logs.
4. Re-run tenant-isolation and replay-safe delivery emulator tests against the restore.
5. Record restoration start/end times, the most recent recoverable mutation and any missing records; compute actual RPO/RTO, then have an operator sign off.
6. Establish alert routing and escalation owners before enabling scheduled recovery in production.

These are deployment and test procedures only; no production backup settings, telemetry sinks or restore drills have been executed by this branch.
