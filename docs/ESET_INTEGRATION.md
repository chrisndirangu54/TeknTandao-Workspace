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
