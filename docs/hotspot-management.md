# TeknTandao Wi-Fi Hotspot Management
This initial control-plane module maintains hotspot sites, bandwidth/time plans and one-time voucher codes in Firestore with super-admin-only Firebase callables, input validation, immutable audit entries and voucher revocation intent.

## Deploy
Deploy Workspace Functions via the existing Firebase project and region europe-west1. The Flutter ISP Suite includes a Hotspot screen. Website hotspot-management.html is a public information page, not a real network captive portal.

## Safety and future integrations
- `hotspotCatalog`, `hotspotList`, `hotspotCreate`, `hotspotRevokeVoucher` are server-side callable functions.
- All router and M-Pesa status flags are false by design. An unissued voucher is **not** an internet access credential until an operator deploys and verifies the gateway/RADIUS adapter.
- Voucher codes are generated using cryptographic randomness, hashed with SHA-256 and exposed only on creation; do not log them.
- Implement short-lived RADIUS credentials, session accounting, CoA/disconnect, rate limits, router inventory, tenant-scoped authorization, settlement verification and webhook idempotency before selling internet sessions.
- Keep network management credentials in server-side secrets; never store them in the browser, Flutter app or Firestore document.
- Set Firestore client rules to deny all writes and reads for hotspotSites, hotspotPlans, hotspotVouchers and hotspotAudit; only privileged functions use the Admin SDK.

## Acceptance checks
Test unauthorized users, schema rejection, duplicate or missing references, opaque one-time codes, revocation audit, and payment/network non-activation with Firebase emulators. This initial commit does not claim such integration tests have passed.
