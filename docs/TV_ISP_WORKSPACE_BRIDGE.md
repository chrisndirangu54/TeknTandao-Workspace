# TV + ISP + Workspace integration staging guide

**This branch is integration groundwork, not an active cross-project migration.** Workspace remains the authoritative admin console; its existing ISP records are planning/management records, not proven router provisioning.

Cross-product shared contracts are in `functions/src/cross_product_entitlements.js`. It validates product types, preserves customer IDs and emits a minimal `subscription.status.changed.v1` event shape. Do not publish this event until verified subscription changes have an outbox and deduplication policy.

TV routes: `GET /v1/me`, `GET /v1/me/subscriptions`, `GET /v1/me/entitlements`, `GET /v1/tv/guide`, `GET /v1/tv/channels/:id/schedule`. Those routes belong to the TV project and must be authenticated against the correct Firebase project.

## Integration sequence
1. Identify the actual Firebase Auth project behind each current app; elect one issuer, or introduce a verified identity broker.
2. Add an explicit, audited mapping for preexisting accounts; matching email alone is insufficient.
3. Make Workspace verified subscription billing authoritative. Use server-side paid entitlements for ISP, TV and Workspace. No client-side status updates.
4. Map ISP planning subscriber codes to customer IDs through approved migration, keeping device credentials and SNMP logs isolated.
5. Add a Workspace dashboard using read-only, per-user APIs for TV and ISP. Later, allow explicitly authorized mutations with role and tenancy checks.
6. Migrate HTML sign-in to the selected authority only after testing existing sign-ins, email verification, and service permissions.
7. Pilot only with permitted content and test routers; do not connect live equipment until separately approved.

## Verification
`node --test functions/test/cross_product_entitlements.test.js`
The current helper is intentionally not wired into real payment callbacks or provisioning. A staging acceptance test must verify user login, bundle purchase, TV-only entitlement, ISP-only entitlement, non-admin rejection, and service cancellation recovery.
