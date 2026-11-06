# TeknTandao multi-operator advertising network — controlled pilot

## Implemented in this change

The network offers opt-in inventory enrollment for independent hotspot operators, independent network-admin review, a cross-operator campaign allocation preview, draft pilot persistence and a zero-claim portfolio dashboard. It **does not** yet deliver or bill network-wide advertisements.

Core code:
- `functions/src/hotspot_network_ads_domain.js`: deterministic allocation using capacity, evidence days, location type and attested uptime; policy checks; illustrative 70/30 operator/platform splitting; conservative event-quality metrics and risk flags.
- `functions/src/hotspot_network_marketplace.js`: App Check and Firebase Auth callable functions for site opt-in/withdrawal; independent approval; inventory listing; campaign preview; draft pilots; portfolio and proposal dashboards.
- `functions/test/hotspot_network_ads_domain.test.js`: allocation privacy, budget conservation, sharing and reporting tests.
- `chrisndirangu54/HTML/hotspot-ad-network.html`: network operator sign-in, site onboarding, approval and preview UI.
- `chrisndirangu54/HTML/hotspot-management.html`: link to network console.

## Architecture and security boundaries

Each opted-in location remains owned by its existing tenant `organizations/{orgId}/hotspotV2/control/sites/{siteId}`. The shared registry stores only minimal site metadata in `hotspotAdvertisingNetwork/{orgId}_{siteId}`, with a corresponding inventory index. No guest identity, MAC, mobile number, payment reference or consented interest data is copied across organizations.

**Who can act:**
- Site submission and withdrawal: a verified owner/admin of that *site's organization*.
- Site approval, network-wide inventory list and campaign planning: owner/admin of the special network-administration organization configured as the Firebase function parameter `HOTSPOT_AD_NETWORK_ADMIN_ORG`.
- Site reviewer must be a different Firebase user from the submitting operator.
- No unauthenticated or guest endpoint exposes cross-tenant inventory.
- Firebase App Check is required for all network actions.
- Site must already be marked `commissioned`, `gatewayVerified`, and `labOnly`. The central review additionally checks its commissioning status.

**Important**: The review values `activeUniqueDays` and `verifiedAvailabilityPct` are currently supplied by the reviewer and tagged **operator-attested / unverified**, rather than calculated from signed NAS uptime evidence. This limitation is visible in results; results must not be marketed as measured traffic.

## Pilot workflow

1. Set `HOTSPOT_AD_NETWORK_ADMIN_ORG` to the exact existing Workspace organization ID of the network administrator. Ensure its admin membership is correctly provisioned. The parameter is not a user-supplied string.
2. Register Firebase App Check and Google sign-in for the public pilot admin console. Set `hotspotWorkspaceFirebase` and `hotspotAppCheckSiteKey` in the public HTML configuration. No server secrets belong in the website.
3. Commission a real private lab hotspot and verify its access controls and RADIUS logs.
4. Owner/admin submits `hotspotNetworkOptInSite` with category and conservative capacity estimate.
5. Independent network admin validates consent, ownership, uptime evidence and site identity; calls `hotspotNetworkReviewSite`.
6. Network admin requests `hotspotNetworkCampaignPreview` with hypothetical budget, category and operator share in basis points. Only approved, opted-in, lab-only, gateway-verified sites with nonzero evidenced capacity can be included. The output is not an authorization to charge.
7. Save the allocation as a `hotspotNetworkCreatePilot` draft. Query `hotspotNetworkPilotDashboard` and `hotspotNetworkPortfolio`; both show 0 paid impressions, 0 settled advertiser money and 0 payable operator revenue.

## What the allocation score means

`score = floor(capacityDaily × verifiedAvailabilityPct/100 × min(1,activeUniqueDays/14))`.

Despite the field name, `verifiedAvailabilityPct` is currently reviewed **self-reported availability**, not cryptographically authenticated telemetry. The score represents evidence-weighted estimated ad opportunity; it is not a predicted conversion count, eCPM or impression estimate. Campaign proposal budget is allocated proportionately to positive scores, with the final location receiving the integer rounding remainder.

Illustrative shares in the preview have **no accounting effect**. The network must not pay out or bill on proposal values.

## Commercial launch dependencies

1. **Inventory & router:** Deploy per-site signed RADIUS accounting and authenticate exact site/operator provenance; reconcile unique gateway Access-Accepts and disconnects. Enforce actual session duration, speed, one-device limit and guest opt-in.
2. **Ad delivery:** Implement a genuine ad-serving decision and independently validated event protocol with deduplicated signed receipt IDs. A sponsor time gate is *not* a verified impression; Google web rewarded SSV cannot be replaced by browser callbacks.
3. **Marketplace commerce:** Add platform merchant-of-record terms, buyer budgets, test-to-live payment migration, receipts, sponsor invoicing, refunds/chargebacks, attribution windows, antifraud audits and transaction-ledger-based escrow/settlement. Run compliance and taxation review for Kenya.
4. **Operator payouts:** Verify operator KYC, bank/M-Pesa payee details through regulated providers, VAT/withholding rules where applicable, payout delays, split-ledger invariants, independent reconciliation and dispute management.
5. **Campaign effectiveness:** Have advertisers supply consent-based, verifiable conversion evidence (coupon, referral lead or receipt). Compare randomized holdout groups to estimate *incremental* sales with uncertainty, not just correlation.
6. **ML optimization:** Train on real permitted campaign/event data after 20–50-site pilot; include adverse selection, fill-rate, site reliability and privacy-fairness tests. Avoid claiming sophisticated AI predictions before training samples are sufficient.
7. **Privacy:** Kenya Data Protection Act review, DPIA where appropriate, retention schedule, marketing opt-in, child-sensitive sites, advertising restrictions, content moderation and advertiser takedown.
8. **Scale:** Batch/paginate beyond current 100-location read and 50-pilot list; create Firestore indexes and scheduled materialized aggregates. Validate function limits, rate limiting and billable Firestore reads.

## Pilot objectives (proposed, not achieved)

Start with 20–50 sites across hostels, estates and commercial locations. Track independently measured opt-in rate, verified pass issuance, gateway admission, bandwidth usage, user abandonment, sponsor renewal, location-specific contribution and advertiser-redemption evidence. Require a separate signed settlement workflow before reporting any Kenya shilling as earned.

## Safety and operations

- The network console is **admin-only**. Do not share site IDs or organization identifiers as substitutes for authentication.
- A reviewer attestation is not independently verified telemetry, and the labels should be corrected when telemetry-derived data is connected.
- Existing local sponsor Paystack integration is explicitly **test only**. Cross-operator campaigns cannot launch live purchases through these new endpoints.
- Grouping by location type is contextual allocation; this network code does not build user-level profiles or transfer customer histories.
