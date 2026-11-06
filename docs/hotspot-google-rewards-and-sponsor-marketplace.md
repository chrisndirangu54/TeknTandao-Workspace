# Google rewarded bundle and local advertiser marketplace

## Implementation status
**Source committed, not commercially launched.** Google Ad Manager ad-unit approval, domain eligibility, signed **web** SSV verifier, advertiser test account, public Firebase App Check and physical Wi-Fi commissioning require external configuration. This implementation will **not** issue a Google-sponsored voucher merely because a browser says an ad completed.

## Three–five ads for 30 minutes
- `chrisndirangu54/HTML/hotspot-google-rewards.html`: sequential Google Publisher Tag rewarded slots, with voluntary consent before each ad. The page listens for `rewardedSlotReady`, `rewardedSlotGranted` and `rewardedSlotClosed` and explicitly destroys each slot when closed.
- `hotspotV2StartGoogleBundle`: authenticated/App-Checked guest, 30-minute zero-price plan, capped at 2 Mbps download and 1 device in the plan metadata, 3/4/5 ad target, and a 20-minute collection window.
- `hotspotV2GoogleBundleStatus`: only reports the **verified backend** reward count, never client events.
- `hotspotV2VerifiedRewardIntake`: accepts authenticated HMAC-SHA256 assertions **only** from a separately deployed and independently validated Google web SSV verifier. Distinct transaction IDs are atomically deduplicated in a global ledger, and duplicate/late rewards cannot increment a bundle.
- `hotspotV2ClaimGoogleBundle`: if the required number of trusted verifications is reached, creates a single-use 30-minute lab voucher. It never calls an ad SDK from Firebase Functions.

### Critical SSV dependency (not yet implemented)
Google's **web** rewarded inventory provides SSV callback support, but publisher-specific callback field mappings and cryptographic validation must be validated against Google's official web SSV contract for the approved Ad Manager network. The AdMob mobile ECDSA SSV guide must **not** be assumed equivalent to the Ad Manager rewarded **web** callback protocol.

A separately audited verifier must:
1. Accept callbacks only from Google's verified SSV channel using Google's applicable documented web signature/provenance validation (or a provider-supported authoritative verification mechanism).
2. Reliably correlate each authoritative transaction to the original tenant, bundle and ad unit using provider-documented fields; disallow caller-chosen bundle IDs without a trusted binding.
3. Enforce transaction-id uniqueness, callback time windows, expected ad unit, correct publisher, and no self-signed browser events.
4. On each verified event, POST a **private verifier assertion** to `hotspotV2VerifiedRewardIntake`:
   - JSON: `{"orgId":"...","bundleId":"...","transactionId":"...","source":"google_web_ssv_verified","adUnit":"..."}`
   - `x-verified-at`: Unix epoch milliseconds as a 13-digit string
   - `x-verifier-signature`: lower-case hex HMAC-SHA256 over `timestamp + "." + raw JSON body bytes`, keyed by `HOTSPOT_GOOGLE_REWARD_VERIFIER_KEY` in the Firebase secret manager.
   - Keep the verifier key private, high entropy and never placed in HTML/Flutter/GitHub.
5. Conduct callback-fraud, replay, multi-tenant, ad-unit mismatch, and end-to-end tests before enabling it.

**Until this external verifier exists, Google rewarded ads can render on the frontend but cannot unlock Wi-Fi, by design.** Ensure a user-visible fallback to another free/local or paid access option. This avoids misleading users about guaranteed inventory and rewards.

### Required public configuration
In `chrisndirangu54/HTML/assets/js/site-config.js`:
- `hotspotWorkspaceFirebase`: public Firebase web config for Workspace project.
- `hotspotAppCheckSiteKey`: public reCAPTCHA v3 site key registered for this domain.
- `hotspotGoogleRewardedAdUnit`: the publisher-approved rewarded **WEB** ad unit path (e.g. `/1234567/rewarded_hotspot`).
Do not enter the Google ad manager private API credentials, publisher verification credentials or site payment secret in the website.

## Local sponsors and voluntary ad personalization
- Advertiser visits `hotspot-advertisers.html`, authenticates (Firebase anonymous sign-in is supported in pilot mode), submits business name, contact details and accepts the terms.
- Workspace operator reviews and approves via `hotspotV2SponsorListApplicants` and `hotspotV2SponsorApprove`.
- Sponsor creates a campaign for **one explicitly approved lab hotspot** and a 30-minute free plan with speed/device caps, preconfigured budget/reward count, duration and HTTPS creative/destination.
- Sponsor starts a Paystack **test-only** KES transaction; independent authenticated `GET /transaction/verify/:reference` confirms test mode, customer email, expected amount, currency and reference, then atomically claims a unique payment reference.
- Operator independently approves the **verified test-funded** campaign before it can be served. The sponsor can see their own campaign status.
- The guest selects an optional **broad** preference such as food, jobs, education or shopping, then separately opts in to personalization. If consent is absent the feed is site-based/contextual. No sensitive attributes, precise personal location, inferred age or persistent profile are used.
- Existing local sponsored Wi-Fi access uses a challenge with a server elapsed-time gate and rate limits. **This does not independently prove an advertisement was viewed** and must not be sold as an independently validated impression or billed as such.
- Paid sponsor campaigns are only `prepaid_test`. Test balances are not commercial revenue, and a campaign is not legally chargeable or a production merchant transfer until settlement, tax, invoicing, refund and sponsor-ledger integration is independently confirmed.

## Provider references
- Google Ad Manager rewarded web ad events and SSV: https://support.google.com/admanager/answer/9116812
- Paystack transaction verification: https://paystack.com/docs/payments/verify-payments/
- Paystack hosted checkout: https://paystack.com/docs/payments/accept-payments/

## Acceptance tests
1. At 3, 4 and 5 Google verified rewarded events respectively, verify that only the matching bundle threshold issues one voucher; unauthenticated client events never change stored counts.
2. Duplicate verifier transaction IDs across tenants cannot earn two rewards; expired bundles and claimed vouchers cannot be replayed.
3. User may dismiss the next Google ad without receiving a reward; one rewarded slot is active at any time.
4. Nonconsenting users get only contextual location matching; sensitive input is rejected.
5. Unapproved sponsors cannot submit campaigns and unpaid sponsor campaigns never activate.
6. Test Paystack wrong email/reference/currency/amount and repeated verification must fail closed or return a safe duplicate status.
7. Revoked or expired hotspot passes must fail actual RADIUS admission; speed and concurrent device policy must be measured against physical NAS.
8. Obtain privacy, advertiser agreement, data retention, consent, public Wi-Fi regulatory and payment licensing reviews before commercial use.

## Remaining features beyond this commit
Commercial advertising payouts and reconciliation, verified ad impression counting for direct sponsors, production Paystack merchant payment settlement, full Google web SSV verifier, audited creative moderation and takedown, user self-service account recovery, physically enforced simultaneous-device quota, refund/chargeback processing, and real gateway acceptance testing.
