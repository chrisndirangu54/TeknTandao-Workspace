# ESET integration — controlled phase 1

Status: **code integrated; no live credentials or deployment verified**.

This initial ESET MSP / PROTECT Hub connector is a secure, **read-only connection verification** feature. It DOES NOT claim endpoint telemetry, billing, provisioning, incident response or customer entitlement activation. The API credentials are central operator secrets, not supplied by tenants. Tenant-owner access is enforced server-side and Firebase App Check is required.

## Supported endpoints

- `getEsetIntegrationStatus({orgId})` — tenant-owner view of prior verification.
- `verifyEsetMspConnection({orgId})` — verify an authorised ESET MSP API identity using `POST /api/Token/Get` and `GET /api/User/Current`; persist only the minimal partner account summary.

Endpoints export through `functions/src/platform_entry.js`. The client adapter restricts requests to `https://mspapi.eset.com`; temporary bearer tokens are never returned or stored.

## Before deploying

1. Have ESET confirm **Kenya MSP API entitlement**, credentials for a dedicated API identity, and whether PROTECT Hub access uses the same permitted endpoints. Do not reuse personal sign-in credentials without ESET approval.
2. Add Firebase secrets using trusted operator CLI: `firebase functions:secrets:set ESET_MSP_USERNAME` and `firebase functions:secrets:set ESET_MSP_PASSWORD`. Do **not** commit secrets or send them through the browser.
3. Validate Firestore tenant membership and App Check, deploy the selected functions in `europe-west1`, and test with a designated test tenant.
4. From a signed-in owner session, call `verifyEsetMspConnection`; use `getEsetIntegrationStatus` to display the minimal connection state.
5. Rotate the secrets and revoke the API identity if compromised. Ensure the Cloud Functions' secret bindings and Firestore access controls are audited.

## Before enabling customer synchronization

Obtain ESET Connect integration rights and document regional endpoints, permissions, data retention, scope mapping and customer consent. Implement **per-tenant ESET company bindings**, scoped API service identities, scheduled bounded incremental polling, deduplication, audit logs and operator approval for actions. Keep billing and incident-response writes disabled until provider-verified integration tests and contract checks pass.

ESET references:
- https://help.eset.com/ema/2/api/en-US/get.html
- https://help.eset.com/ema/2/api/en-US/current.html
- https://help.eset.com/eset_connect/en-US/eset_apis.html
- https://help.eset.com/eset_connect/en-US/incident_management_v1_detections_get.html

Run tests: `npm --prefix functions test`.


## Phase 2: Customer-scoped ESET Connect dashboard and approval queue

**Implemented on this branch (not yet deployed):**
- `approveEsetCustomerBinding({orgId,binding})`: platform-operator-only, App-Check-protected binding, requiring validated `ownerUuid`, region, customer consent evidence and entitlement evidence. Binding cannot be changed to another ESET tenant without a separate audited migration/purge.
- `syncEsetSecuritySnapshot({orgId})`: platform-operator-triggered, bounded read-only ESET Connect polling for managed endpoints and seven-day detections using a **separate dedicated ESET Connect API account**. It refuses incomplete pagination and projects only devices belonging to the approved ESET `ownerUuid` and detections relating to those device UUIDs. No full ESET payloads are stored.
- `getEsetSecurityOverview({orgId})`: owner-only snapshot status and capped current-run inventory / detections. A sync run identifier prevents stale results from previous runs being displayed as current.
- `requestEsetOperationReview`, `listEsetOperationReviews`, `decideEsetOperationReview`: tenant-owned, approval-only workflow for licence quotes and renewals, policy changes, endpoint remediation and incident resolution. **These functions never execute provider-side changes, charges or orders.**
- Flutter module `eset_security`: cybersecurity dashboard with endpoint statuses, detection records and manual review requests.

**Required ESET Connect secrets (not the MSP account):**
```sh
firebase functions:secrets:set ESET_CONNECT_USERNAME
firebase functions:secrets:set ESET_CONNECT_PASSWORD
```

**Prerequisites:** ESET Connect subscription/API user with access to the customer tenant, provider-authorized region (`eu`, `de`, `us`, `ca`, `jpn`), explicit signed/recorded customer consent and provider entitlement. ESET Connect's provider-reported `device.ownerUuid` is distinct from the EMA2 `companyId`; **never bind one without verifying the mapping**. Use the immutable operator approval endpoint only after checking the provider identifiers.

**Data flow:** `ESET Connect OAuth2 (password grant) → allowed region/host → bounded list devices → match approved ownerUuid → bounded list detections → keep only those matched devices → minimal Firestore projections → owner-only Flutter dashboard`.

**Production safety:** The current sync is manually operator-triggered; no background scheduler is active. No ESET action is automated. Approval alone does not authorize deployment or installation. Turn on recurring sync only after provider-scoped, privacy-reviewed field tests, API rate-limit analysis, paging strategy for customers over 500 devices/detections, refresh and retention policy, Firestore rules/emulator testing and a rollback plan. Incident Management v1 detections will be replaced by newer incident-centric APIs; migrate before deprecation.

**Commands to verify locally:**
```sh
npm --prefix functions ci
npm --prefix functions test
cd apps/dashboard
flutter pub get
flutter analyze --no-fatal-infos
flutter test
```

**ESET references:**
- https://help.eset.com/eset_connect/en-US/authentication_oauth_token_post.html
- https://help.eset.com/eset_connect/en-US/device_management_v1_devices_get.html
- https://help.eset.com/eset_connect/en-US/incident_management_v1_detections_get.html
- https://help.eset.com/eset_connect/en-US/incident_management.html

## Incomplete before live release

- API credentials, licensing agreements, region and tenant grants have **not** been provisioned.
- Live end-to-end verification, Firestore rules and client integration tests still need to pass.
- Multi-customer scheduled polling, high-volume pagination, data retention and incident-v3 migration require follow-on engineering.
- Automatic subscription orders, billing, remediation, incident resolution and other changes are intentionally **not enabled** pending explicit provider/customer approval and a reviewed separate implementation.
