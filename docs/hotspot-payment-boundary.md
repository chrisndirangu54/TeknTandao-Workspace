# Hotspot payment and gateway integration status

The management system can create **draft payment intents** for active, site-bound paid vouchers. Creating an intent does **not** initiate an STK request, debit a customer, verify a payment or provision internet access.

## API
- `hotspotCreatePaymentIntent({voucherId})`: super-admin-only, creates an immutable price snapshot and an audit event. Repeated creation is rejected.
- `hotspotPaymentIntentStatus({voucherId})`: super-admin-only, returns status and an explicit false provider-verification indicator.
- `reconcileHotspotMpesa({order,provider,receipt})`: pure helper; requires matching provider checkout result, authoritative verified-provider receipt, merchant account, amount, and order.
- `hotspotPaymentGate(...)`: pure helper; requires a previously provider-verified payment attached to the same site, plan and voucher.
- `authorizedGatewayGrant(...)`: independent gateway preflight; needs verified gateway metadata and issued voucher. None of the currently exposed APIs can mark `gatewayVerified`, `routerConnected`, `receiptVerified` or the voucher as `issued`.

## Important separation of Firebase projects
The HTML website uses Firebase project `tekntandao`. The Workspace Functions use the Workspace project's configured Firebase deployment. They are not interchangeable.

The HTML `hotspot-portal.html` only calls the catalog when `window.TEKNTANDAO_CONFIG.hotspotCatalogCallableUrl` points to the **deployed HTTPS Workspace `hotspotPortalCatalog` callable**. Set that value in the website runtime config only after the backend is deployed, a CORS check succeeds, and publication rights are reviewed. The endpoint is deliberately unset by default, so portal plans will remain unavailable until configured. Never put router secrets or provider keys in website configuration.

## Blockers before real payments or access
1. Deploy a secure authenticated M-Pesa server-side implementation and record provider evidence through a transaction, with unique receipt constraints, idempotent retries and amount reconciliation. Current Firebase modules provide no hotspot M-Pesa side effects.
2. Deploy FreeRADIUS SQL with a site-bound NAS certificate/secret and secure out-of-band credential distribution.
3. Implement an atomic voucher issuance/redemption flow after a verified provider settlement, then independent RADIUS provisioning and CoA/disconnect workflows.
4. Establish real gateway health verification and reconcile session counters.
5. Run the GitHub hotspot policy CI workflow, then Firebase emulator integration tests, followed by physical RouterOS test cases.
6. Confirm telecom service authorization, acceptable-use, privacy and data-retention policies.

All customer payment and network activation paths remain **disabled**.
