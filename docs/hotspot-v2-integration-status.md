# Hotspot v2 launch blockers — implementation update

## What is now implemented in code
- Tenant-scoped site commissioning with explicit network checklist and NAS ID; commissioning retains `gatewayVerified:false`.
- Published plan transition gated by a commissioned site.
- Voucher preparation: free plan => issued record; paid plan => pending_payment; no RADIUS credential is generated.
- Voucher revocation already existed; a new idempotent disconnect-request record requires the voucher be revoked and an operator justification. No disconnect executes.
- Safaricom **sandbox** STK request and provider-query callables for an approved operator. These use the existing `initiateMpesa` and `queryMpesa` utilities with `live:false`, server-side secrets and a fixed reservation per voucher. The query is not sufficient to verify receipt, merchant or paid amount, so it cannot mark an order settled.
- Independent authorization state-machine tests: wrong amount, foreign site, missing payment, unverified gateway, same-person approval, stale/forged gateway receipt, and fabricated access-ack attempts must fail.

## Configure the sandbox
Set the following Firebase Functions secrets in the **Workspace** project, not the public HTML website:

```bash
firebase functions:secrets:set HOTSPOT_MPESA_KEY
firebase functions:secrets:set HOTSPOT_MPESA_SECRET
firebase functions:secrets:set HOTSPOT_MPESA_SHORTCODE
firebase functions:secrets:set HOTSPOT_MPESA_PASSKEY
firebase functions:secrets:set HOTSPOT_MPESA_CALLBACK_URL
```

The callback URL must be HTTPS and refer to a separately deployed and reviewed collection endpoint. **No authenticated callback-ingestion endpoint is implemented in this branch.** These functions intentionally do not mark any transaction verified, and no live payment mode is supported.

## Pilot API summary
- `hotspotV2CommissionSite({orgId,siteId,nasId,checks})`
- `hotspotV2PublishPlan({orgId,planId})`
- `hotspotV2PrepareVoucher({orgId,voucherId})`
- `hotspotV2RequestDisconnect({orgId,voucherId,reason})`
- `hotspotV2StartSandboxMpesa({orgId,voucherId,phone})`
- `hotspotV2QuerySandboxMpesa({orgId,voucherId})`

All functions require an authenticated Workspace owner/admin. The operator role remains read-only in v2.

## Still unresolved before commercial traffic
1. Deploy and test FreeRADIUS SQL against a physical MikroTik hotspot on a private management network.
2. Implement a signed, hardware-attested gateway execution service, independent operator approval, credential rotation and NAS-specific CoA/disconnect acknowledgement.
3. Implement provider-authenticated Safaricom settlement evidence, enforce unique receipts and amounts, and use an atomic payment verification + voucher issue transaction.
4. Implement gateway event ingestion scoped to the tenant and verify actual signal, latency, active sessions and telemetry provenance. The existing collector tracks legacy pilot events but does not prove v2 gateway health.
5. Run static checks, Node test suite, Firebase emulator integration tests, Flutter analysis, and physical network trial.
6. Confirm operational and regulatory obligations before charging customers or reselling connectivity.

**Do not label an STK query ResultCode=0 as a verified payment. Do not enable live vouchers based on operator attestations alone.**

## Acceptance target
All unauthenticated, wrong-tenant, unpaid, revoked, expired and replayed voucher attempts reject. The same voucher must never be provisioned twice, and a revocation must be reconciled against NAS disconnect acknowledgments. Gateway reconnection, accounting rollovers, provider outages and recovery must have measured test evidence before go-live.
