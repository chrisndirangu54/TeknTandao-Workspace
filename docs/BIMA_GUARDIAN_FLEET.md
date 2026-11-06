# Bima Guardian insurance for Workspace Fleet / Freight

Bima Guardian is an **optional insurance provider adapter** in the same Fleet/Freight control tower that also supports shipment dispatch, carrier coordination and Fleet Yangu vehicle health.

## Available
- `logisticsBimaGuardianConsent`: 30-day, owner-recorded explicit consent to transmit only cover category and sum insured.
- `logisticsBimaGuardianOverview`: restricted owner-only quote, policy, claim draft, renewal status listings.
- `logisticsBimaGuardianQuote`: server-side `POST /v1/quotes` for `motor:fleet` or `motor:commercial` against Bima Guardian's gateway; normalized output is tagged **indicative_not_bound** even if backed by an uploaded rate card.
- `logisticsBimaGuardianRecordPolicy`: records **unverified** insurer/policy number/start/expiry attached to a registered Workspace vehicle.
- `logisticsBimaGuardianDraftClaim`: prepares a local claim note linked to an operator policy, and optionally a shipment, with **no remote claim filing**.
- Dashboard panel: **Bima Guardian · Fleet insurance** inside Fleet and Freight.

Code: `functions/src/bima_guardian_fleet.js`, `functions/src/bima_guardian_fleet_domain.js`, `functions/test/bima_guardian_fleet_domain.test.js`, `apps/dashboard/lib/modules/fleet_module.dart`.

## Provisioning and security
1. Verify that Bima Guardian's `customer_app/insurance-api` has a production-authorized, hardened API gateway and insurer-approved catalogue. Current stand-alone Bima Guardian API is **local-only and demo-capable**; neither code integration nor its catalogue implies insurer authority.
2. Configure Workspace Functions' `BIMA_API_BASE_URL` to the production-managed HTTPS gateway base and Firebase Secret Manager `BIMA_API_KEY` to the upstream API key. Never commit either credential, embed the key in Flutter, or put an insecure development server on the public internet. The quote callable alone receives this secret.
3. Deploy Functions and dashboard. Workspace owner with a valid Fleet or Freight entitlement can load Bima data, explicitly authorize its narrow use, and request a quotation for an existing Workspace vehicle.
4. Record policy reference/expiry manually for tracking. Treat recorded policies as **unverified** and **not proof of cover** until confirmed by an actual insurer via a future authorized verification API.
5. Claims created in Workspace remain **local drafts**, never paid or transmitted automatically. Only send claim data to the insurer in an approved future integration with separate purpose-specific consent.

No identity, registration, driver telemetry, location trace or health data is sent in the quote request. There is no goods-in-transit API coverage in the Bima Guardian current product catalogue; do not market cargo/GIT as quoted through this adapter. No Fleet Yangu cross-project insurance data syncing is performed: each application keeps records separately pending explicitly granted permissions and reconciliation of duplicate policies.

## Verification checklist
- Owner and entitlement restrictions, cross-org policy IDs, no direct Firestore reads, input date validation.
- Consent enabled/expired/revoked; insecure upstream blocked.
- Demo quotes displayed as **indicative/demo**, no insurer binding or premium payment.
- Timeouts, rate limiting, audit/retention policy and no distribution of protected information.
- Insurer source verification, underwriter authorization, regulator and licensing review, and production acceptance tests before marketing live insurance.
