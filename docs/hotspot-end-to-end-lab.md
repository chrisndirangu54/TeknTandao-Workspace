# Hotspot v2: end-to-end payment-to-RADIUS laboratory pilot

This is an executable **source-code integration path**, not a proof of deployed router operation or real-money settlement. It deliberately uses **Paystack test keys only** and two different Workspace administrators to approve laboratory gateway operation.

## Deployment dependencies
1. A separate Workspace Firebase project, Firebase CLI, deploy permissions and Firestore rules.
2. One Paystack merchant **test** integration with M-Pesa enabled for Kenya. No `sk_live_` credentials are accepted by this code.
3. A MikroTik HotSpot NAS, FreeRADIUS 3.2.10 in an isolated VLAN, and a private bridge host with HTTPS egress.
4. Two distinct Workspace `owner` / `admin` members for independent lab approval.
5. A real DNS/TLS-protected callback URL and matching configured Paystack webhook. No customer PINs are ever collected by TeknTandao.

## Firebase secrets (set on the Workspace project)
```sh
firebase functions:secrets:set HOTSPOT_PAYSTACK_TEST_SECRET
firebase functions:secrets:set HOTSPOT_RADIUS_BRIDGE_HMAC_KEY
firebase functions:secrets:set HOTSPOT_MPESA_KEY
firebase functions:secrets:set HOTSPOT_MPESA_SECRET
firebase functions:secrets:set HOTSPOT_MPESA_SHORTCODE
firebase functions:secrets:set HOTSPOT_MPESA_PASSKEY
firebase functions:secrets:set HOTSPOT_MPESA_CALLBACK_URL
```
The HOTSPOT_MPESA_* values are **only** needed if testing the earlier direct Daraja sandbox path. Paystack test settlement uses only `HOTSPOT_PAYSTACK_TEST_SECRET`.

Deploy Functions and Firestore rules to an explicitly selected test project after review:
`firebase deploy --only functions,firestore:rules --project YOUR_TEST_PROJECT`

In the Paystack test merchant dashboard configure the signed webhook endpoint `https://europe-west1-YOUR_TEST_PROJECT.cloudfunctions.net/hotspotV2PaystackTestWebhook`. The endpoint verifies `x-paystack-signature` and then **re-queries Paystack**; neither browser redirects nor webhook bodies independently authorize internet access.

## Prepare a laboratory hotspot
1. Create a tenant-scoped site, configure a guest VLAN, RADIUS NAS and account logging, and commission the site only after actual checks.
2. An administrator calls `hotspotV2RequestLabGateway` with four traceable test references. A **different** administrator calls `hotspotV2ApproveLabGateway`. This sets `gatewayVerified` and `radiusEnabled` based on **two-person operator attestation**, not remote automated hardware measurement. Only do this after testing a real gateway.
3. Publish a speed and time-limited plan and create a voucher. Save its one-time code. Its ID becomes the RADIUS `User-Name`, while the code is the `User-Password`.
4. Call `hotspotV2PrepareVoucher`. A free plan becomes `issued`; a priced plan becomes `pending_payment`.

## Paid voucher via Paystack test M-Pesa
1. Call `hotspotV2StartPaystackMpesaTest` with Workspace ID, voucher ID, an email and a Kenyan mobile number. The backend saves an immutable KES price, starts a Paystack `mpesa` charge using a **test** key, and indexes its unique reference.
2. When Paystack reports `charge.success`, the signed webhook looks up that reference and calls Paystack's authenticated `GET /transaction/verify/:reference`.
3. Only if the authenticated verification returns `domain=test`, `status=success`, `channel=mobile_money`, `currency=KES`, exactly the expected reference and `amount = priceKes × 100`, plus a matching customer email, does a transaction atomically claim the reference and set the voucher to `issued`.
4. The admin may also call `hotspotV2VerifyPaystackMpesaTest` when a webhook is delayed. Both paths use the same transaction and reference uniqueness ledger.
5. A different administrator must independently approve `hotspotV2RequestPaidLabPass` via `hotspotV2ApprovePaidLabPass` before RADIUS admission is eligible. For free plans, use the corresponding FreePass requests.

## Private FreeRADIUS bridge
- Build from `infrastructure/hotspot-radius/Dockerfile.bridge`, with `bridge.mjs` and `bridge.env.example`. Do not publish the bridge on the public internet.
- Use `compose.bridge.yml` to keep RADIUS on a private internal network while permitting the bridge outbound HTTPS. The Docker scaffolding **does not automatically install NAS secrets, virtual server policies or a registered gateway**; add reviewed private FreeRADIUS configuration.
- In FreeRADIUS 3, use `hotspot_rest.example` as the starting `rlm_rest` module configuration. It sends the username and password to the local bridge. The bridge signs each upstream request with HMAC-SHA256 over timestamp and exact body bytes, and the backend checks a Firestore nonce against replay.
- The backend checks workspace/site/NAS scope, a stored voucher digest, price settlement, enabled gateway state, expiry and speed policy before returning `Session-Timeout` and `Mikrotik-Rate-Limit`. All missing, stale, revoked or mismatched inputs fail closed.

## Acceptance tests (not yet observed)
- 100 successful/failed lab RADIUS auth attempts, including wrong site, wrong code, wrong NAS and replayed HMAC.
- Revoke an active session and confirm a **real CoA/Disconnect** action or timeout on actual hardware. Immediate CoA is NOT implemented in this release: do not promise immediate access removal.
- Independently check resulting upload/download rate and expiry on MikroTik.
- Run duplicate Paystack webhook and manual verification concurrently; exactly one payment claim and one voucher issuance must succeed.
- Verify charge failure and amount mismatch reject without issuing credentials.
- Check Firestore emulator rules for denial of cross-tenant and all direct payment/voucher/secret reads.
- Confirm configuration with production carrier and local legal/privacy obligations before deploying a live-money system.

## Outstanding blockers
Real hardware commissioning, public customer checkout, production Paystack merchant settlement and account routing for independent resellers, automated NAS CoA/disconnection, production alerting, and end-to-end test evidence. **None is implied by these committed files.**

See also: `docs/hotspot-v2-architecture.md` and `docs/hotspot-gateway-and-payment-setup.md`.
