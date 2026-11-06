# Production-oriented hotspot RADIUS bridge (hardware validation outstanding)

## Deployed code components
- `functions/src/hotspot_v2_radius_endpoint.js`: HTTPS endpoint validates HMAC-SHA256(timestamp + "." + raw request bytes), 60-second clock window, per-request nonce replay ledger, tenant/site/NAS association, voucher code, session duration, price evidence and plan speed constraints. It responds with explicit Access-Accept-like reply properties only if every rule passes; all other cases deny.
- `infrastructure/hotspot-radius/bridge.mjs`: isolated Node bridge transforms FreeRADIUS `rlm_rest` User-Name/User-Password attributes to the signed HTTPS request and maps approved attributes to FreeRADIUS reply properties. Site and tenant IDs come from trusted deployment environment, never client-supplied attributes.
- `infrastructure/hotspot-radius/hotspot_rest.example`: laboratory FreeRADIUS module configuration. It must be attached to a reviewed isolated virtual server with an explicit deny-on-error policy.
- `functions/src/hotspot_v2_mpesa_callback.js`: accepts Safaricom STK callback evidence only with a one-time checkout callback token, and stores the evidence as **untrusted**. This endpoint never settles payment.
- `functions/src/hotspot_gateway_approvals.js`: independent owner/admin approval for an existing revocation disconnect request. It never issues a network command.

## Private gateway deployment
1. Set `HOTSPOT_RADIUS_BRIDGE_HMAC_KEY` through the Workspace Firebase Secret Manager with a high-entropy secret (>=32 random characters or better). Use the **same** value securely on the bridge host; never place in a public frontend, repo or logs.
2. Set `HOTSPOT_AUTHORIZATION_URL`, `HOTSPOT_ORG_ID`, `HOTSPOT_SITE_ID`, `HOTSPOT_NAS_ID`, `HOTSPOT_BRIDGE_HOST`, `HOTSPOT_BRIDGE_PORT` using a private deployment environment as shown in `bridge.env.example`.
3. Run the bridge in an internal VLAN/container network. Configure FreeRADIUS to reach its port, but do not publish that port to the internet.
4. Configure a FreeRADIUS virtual server with `hotspot_rest` in `authorize`, using a dedicated NAS shared secret and explicit `Auth-Type := Accept` only when the module returns `ok`. Reject all failures and never route to an alternate permissive authentication path.
5. Test `radtest` / `radclient` against FreeRADIUS, then test MikroTik HotSpot with the exact dictionary and rate orientation. **The included example is not a complete NAS configuration**.
6. Configure Firestore TTL policy for the `expiresAt` field in the nested `radiusNonces` collection group, allowing replay nonce documents to be deleted after expiry; otherwise the ledger grows.
7. Use reliable outbound TLS with strict certificate validation and a private egress path. The bridge must be reachable only by FreeRADIUS.

## Operator safety gates
The existing application does not expose any operation that sets `gatewayVerified=true`, `radiusEnabled=true`, `gatewayProvisioned=true`, or `voucher.state=provisioned`. These values **must not be set manually to fake readiness**. Build a hardware-attested commissioning step, independently approved provisioning worker, and verified payment settlement path before using the endpoint for real customers. Until these requirements exist, RADIUS authorization remains fail-closed.

## Payment verification
Safaricom's STK Push callback is not independently authenticated with a digital signature. The callback receiver stores only evidence, and the query result alone cannot confirm receipt amount and merchant. Obtain independent authenticated transaction reporting/receipt reconciliation (for example, with an approved provider or M-Pesa business statement integration), use a unique transaction receipt registry, reconcile into a verified settlement document and atomically issue a voucher. Safaricom's Transaction Status API is asynchronous and needs separately secured initiator credentials and callback validation; never treat a new provider callback as independent proof simply because it has a different URL.

## Verification
- `node --test functions/test/hotspot_radius_authorization_domain.test.js functions/test/hotspot_settlement_domain.test.js`
- `node --check infrastructure/hotspot-radius/bridge.mjs`
- `npm --prefix functions test`
- `flutter analyze` under `apps/dashboard`.
- End-to-end tests with actual hardware and Safaricom sandbox are **not executed** in this session.

Do not enable public paid Wi-Fi until independent security and licensing review, measured link reliability, provisioning recovery, revocation/CoA and payment-dispute handling have passed.
