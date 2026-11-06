# Hotspot Control Center v2 — Architecture and Production Gates

## Implemented as source code
- A new Flutter Hotspot Control Center with active-workspace lookup, paginated lists, client-side search, manual site/plan/voucher creation and administrative revocation.
- Firebase callable functions `hotspotV2Catalog`, `hotspotV2List`, `hotspotV2Create`, `hotspotV2Revoke`. They use `organizations/{orgId}/members/{uid}` for per-request authorization, and all records live under `organizations/{orgId}/hotspotV2/control/`.
- Server-generated 128-bit random voucher tokens. The cleartext voucher is returned once and a salted HMAC digest is stored. The digest and salt are removed from list responses.
- Transactional checks ensure a plan belongs to a site before a voucher can be created. Every mutation gets a server-generated audit event.
- Default-deny Firestore client access to all new hotspot v2 collections; every read/write goes through the callable backend.
- The legacy super-admin pilot remains separate, to avoid accidental cross-tenant migration or activation.

## Explicit limitations
This is **not** a deployed RADIUS authorization service, a customer checkout, payment processing, internet resale, or a promise of production uptime. The v2 vouchers remain drafts. A document can be revoked, but a revocation does not disconnect an already-authenticated network session. An existing MikroTik/FreeRADIUS pilot configuration is still a laboratory template, not proven connectivity.

## Migration strategy
1. Verify current pilot records and export metadata only; never export cleartext voucher codes or reassign an existing owner implicitly.
2. Create v2 sites and tariffs in the correct organization; validate those links before importing voucher inventory.
3. Never reuse old voucher secret digests as live credentials. Rotate every voucher secret during migration, issue it by a secure out-of-band mechanism, and expire old credentials.
4. Maintain the pilot super-admin endpoints in maintenance mode until all migrated records pass reconciliation.
5. Only after a gateway adapter has tests, add issuance and operational status to v2; keep historical billing and audits immutable.

## Production architecture
```text
Flutter Workspace (authenticated org)              Public web (published catalog)
                 |                                       |
                 v                                       v
        Firebase callable API                  Rate-limited read-only API
                 |                                       |
         scoped RBAC, audit                    no private client data
                 |
     Firestore org-scoped inventory
                 |
    reviewed payment settlement ledger   <-- verified M-Pesa server integration
                 |
         authorization outbox
                 |
   private gateway service + FreeRADIUS SQL
                 |
        MikroTik NAS via private VPN
                 |
        authenticated RADIUS accounting
                 |
       normalized usage / observability
```

## Measurable launch acceptance criteria (targets, not achieved results)
| Area | Proposed gate |
| --- | --- |
| Isolation | 100% of cross-tenant API and Firestore test requests denied |
| Unpaid access | 0 Access-Accept events for unpaid or unknown vouchers across 1,000 lab attempts |
| Expiration | Verified rejection after expiration and disconnect of existing sessions in supported NAS models |
| Reliability | Duplicate payment and accounting callbacks never double-charge or duplicate activation |
| Session accounting | Reconciled test traffic within a measured tolerance, with counter rollover/restart cases |
| Provisioning | Command acknowledgement, bounded retries, idempotency and independent approval logs |
| Availability | Define and observe actual gateway and RADIUS service SLOs after deployment |
| Privacy | Limit personal data collection; publish notice and document a retention/delete schedule |
| Recovery | Prove restore, re-keying, router rollback, and manual fail-closed operation |

## Operational considerations
- Run RouterOS management and RADIUS server privately, not over the public website.
- Validate RouterOS/FreeRADIUS version and compatibility on actual target devices.
- Use secret-manager credentials with rotation, TLS/private tunnels and strict NAS allowlists.
- Enforce concurrent-device limits at RADIUS/accounting level, not by displaying a field in the dashboard.
- Use server-side payment verification: merchant, amount, checkout ID, unique receipt and voucher association.
- Obtain relevant approvals/licensing and define upstream licensed-carrier arrangements before commercial resale.
- No AI agent may bypass access-policy invariants or execute live router changes without an authorized change request.

## Verification
The GitHub Actions hotspot-gateway workflow contains Node syntax and domain policy tests. A green CI status, Flutter analyzer result, Firebase emulator integration tests, live M-Pesa sandbox tests, gateway telemetry and a physical NAS test are **not confirmed** in this session.
