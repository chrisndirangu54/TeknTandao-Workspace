# Phase 1 Foundation — Firebase-native first implementation

This feature branch adds a safe, additive enterprise party API without replacing the production Flutter/Firebase architecture. It is **not** a completed Phase 1 rollout.

## Files
- `functions/src/foundation_domain.js`: validation, permissions and versioned event contracts.
- `functions/src/foundation.js`: callable APIs for create, get and list.
- `functions/test/foundation.test.js`: pure-domain regression tests.
- `functions/src/platform_entry.js`: exports the new callable endpoints.

## Firestore paths and safety
All new records are under `organizations/{orgId}`: `enterpriseParties`, `foundationOutbox`, `foundationIdempotency`, and `foundationAudit`.
Existing Firestore rules have no explicit client permissions for these collections; access is through Admin SDK callable functions only. Client-originated requests cannot write them directly. Do not add broad client wildcard permissions.

Creation verifies the authenticated Firebase identity and active owner/admin membership, writes the party/outbox/audit/idempotency receipt within one Firestore transaction, and never accepts a client supplied tenant owner. Idempotency receipts are scoped by tenant path and hashed caller/key.

## Verification
```sh
npm --prefix functions ci
npm --prefix functions test
```
Also run Firestore-emulator integration tests with two organizations and non-owner actors before enabling UI access.

## Remaining Phase 1 work (not represented as complete)
1. Add Firestore emulator API tests for cross-tenant reads, disabled membership, failed/replayed transactions and permission revocation.
2. Define outbox dispatcher with leases, retries, dead-letter monitoring, bounded retention and idempotent consumers. No event publisher is deployed by this branch.
3. Build organization/branch reference model and migration reconciler for existing contacts/customers/suppliers.
4. Introduce OIDC federation or retain Firebase Auth with documented session governance; do not switch identity systems without migration.
5. Implement observable workflow runtime, structured telemetry and dashboards.
6. Add backup restore tests, security scans, load testing, SLOs and audited migration gates.
7. Review existing Firebase Security Rules and service-side authorization for all legacy modules.
8. Run CI and stage a canary rollout before any production deployment.

## Integration boundary
These callables are exported but the UI has not been changed and nothing is deployed. Existing production workflows are unaffected.
