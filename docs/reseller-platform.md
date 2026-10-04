# Reseller platform

Open the storefront icon on the dashboard or `/?module=reseller`. Website Studio also has a Reseller shortcut. Workspace owners can manage their library and client invoices. Selling bundles requires a platform administrator to enable that workspace with `setResellerAccount({workspaceId, enabled: true})`; the caller must have the server-issued `platformAdmin: true` Firebase Auth claim. Ordinary workspace owners cannot enable themselves or issue arbitrary app entitlements.

## Pricing and selling

1. In **Pricing & costs**, configure your profit and actual model rates. No commercial prices or exchange rates are assumed.
2. Generate a website in Website Studio, or install one of the four content templates in **Library**. Save successful sites back to your workspace library.
3. For a custom domain, request a Namecheap quote. The quote includes registration and ICANN costs, the configured USD/KES conversion, and a 15-minute expiry. Sandbox quotes cannot be sold.
4. Offer the site to a separate client workspace, selecting workspace apps and, optionally, a domain quote and matching generation usage record.
5. Record that client's allocated Firebase cost for the month, including an evidence reference and whether the amount is estimated. Create the invoice from **Clients**.
6. The client owner opens **Reseller → Invoices**, reviews the breakdown, and pays through Paystack. Verification or the signed webhook activates their site and apps. No client-supplied amount or payment-success flag grants access.
7. After the domain line has been paid, the reseller supplies the registrant details and explicitly confirms registration. **Connect domain to hosting** provisions Firebase Hosting and returns its DNS records. Add those records in Namecheap Advanced DNS and check again until DNS and TLS are active.

All prices use integer KES minor units internally; UI inputs use KES and percentages.

```text
monthly price = allocated Firebase cost
              + fixed monthly profit
              + ceil(allocated Firebase cost × markup basis points / 10,000)

generation price = actual model token cost
                 + fixed generation profit
                 + ceil(token cost × markup basis points / 10,000)
```

Token cost counts uncached input, cached input, output, and thinking tokens separately using the configured model rates. It rounds the aggregate up to a minor unit with integer arithmetic. Rates and profit are captured in each usage charge and bundle offer. Existing offers retain their policy when you change prices. Records without complete provider usage remain unpriced; validated records with usage can be priced explicitly after configuring matching model rates. Invalid generated content cannot be sold as a generation charge.

Firebase cost allocation is explicit, not an automatic reading of the entire project bill. Attribute Hosting, Firestore, Functions and shared infrastructure to each client once, with evidence from your billing export. Include static-egress infrastructure in that allocation where appropriate. Payment-provider fees, taxes and reseller payouts are not calculated by this feature: provider fees reduce the money received, so account for them in your profit. Earnings are recorded, not automatically transferred to resellers.

A seller may have one current bundle per client workspace, preventing the same monthly workspace allocation from being billed twice. A generation usage charge and domain reservation can each belong to only one offer. Cancelled domain reservations or uncertain checkout outcomes require operator reconciliation before reuse.

The first invoice includes any agreed generation charge and the one-year domain registration as separate lines. Domains are an **annual pass-through**, not silently included in the monthly Firebase charge. Domain renewal is currently handled through the registrar, with the renewal-review date visible in bundle details; automatic registrar renewals and annual renewal invoices are not implemented.

Each verified monthly invoice buys 30 days of access. Monthly invoices are prepared only when a client cost allocation exists. This is invoice-based renewal, not an automatic card debit. Cancellation stops new invoices and preserves paid access. A checkout that settles after cancellation is honored without restarting renewal. The hosted runtime rejects expired bundle access (using a short server cache), and the daily maintenance job removes expired site publications; workspace app checks enforce their own expiry. Existing independently paid app access is preserved. Payment attempts with an uncertain provider outcome remain marked for review instead of automatically creating another checkout or repeating a domain purchase.

## Structured generation and portability

`website_components.js` defines a strict plain-content schema, six versioned components, and four presets: business, clinic, agency, restaurant. Both website-generation entrypoints ask Gemini for this schema. The server rejects extra fields, executable markup, bindings, unsafe links and unsupported templates, then compiles the document itself. Product-only business plans preserve the existing site.

The legacy manual editor and marketplace remain available. A site can be captured as a vetted template or sold/exported through this flow only while its document matches its validated content blueprint. Manual layout edits require regenerating structured content before that site can be treated as vetted again. Templates saved in this flow are private to the seller workspace; library entries retain their source revision and component-library version.

**Export** downloads `index.html`, `contact.html`, `styles.css`, `content.json` and a README. Put them in one directory on any static web host. Exported sites need no model, Firebase SDK or JavaScript runtime; workspace apps and their data remain separate. Generated mobile navigation and page actions are covered by Flutter widget tests. Generation is limited to 30 requests per workspace per UTC day.

## Production configuration

The existing Firebase project needs Blaze billing and deployed backend functions. The last checked project state had billing disabled; this implementation has not been released online.

Configure these existing secrets: `GEMINI_API_KEY`, `PAYSTACK_SECRET_KEY`, `WEBSITE_ANALYTICS_SIGNING_KEY`. Set `GEMINI_MODEL` and optionally `WEBSITE_FIREBASE_HOSTING_SITE_ID` in the Functions environment. The Functions service account needs the required Firebase Hosting custom-domain permissions.

Store `NAMECHEAP_CONFIG` only in Secret Manager:

```json
{
  "apiUser": "NAMECHEAP_API_USER",
  "username": "NAMECHEAP_USERNAME",
  "apiKey": "NAMECHEAP_API_KEY",
  "clientIp": "YOUR_STATIC_PUBLIC_IPV4",
  "sandbox": true
}
```

Use Namecheap sandbox credentials for testing. Production requires API access on the registrar account, sufficient registrar balance, and the actual outbound public IPv4 on Namecheap's whitelist. Setting `clientIp` alone does not make egress static. Configure a VPC connector and Cloud NAT static IPv4, set `NAMECHEAP_VPC_CONNECTOR`, and redeploy the registrar callables; they route all traffic through that connector. Live requests reject a missing connector. Supported standard ASCII second-level domains are `.com`, `.net`, `.org`, `.co`, `.io`, `.biz`, `.info`; premium and early-access registrations are rejected.

Keep the existing **paystackWebhook** as your Paystack webhook URL: it now dispatches reseller references as well as ordinary app-subscription references. `resellerPaystackWebhook` is available for a separate reseller-only Paystack configuration, but replacing the shared webhook with it would omit ordinary subscription payments.

Run `scripts/deploy-automation.ps1` for metadata-only preflight and add `-Deploy` only when ready to publish. It deploys the affected automation, reseller, website-generation, payment and runtime endpoints before Hosting. The script never creates secrets, links a billing account, or purchases domains.

References: [Namecheap API setup](https://www.namecheap.com/support/api/intro/), [pricing](https://www.namecheap.com/support/api/methods/users/get-pricing/), [domain availability and fees](https://www.namecheap.com/support/api/methods/domains/check/), [registration](https://www.namecheap.com/support/api/methods/domains/create/).

## Verification

```powershell
npm --prefix functions test
npm run test:reseller
cd apps/dashboard
flutter analyze --no-pub
flutter test --no-pub test/reseller_studio_test.dart test/automation_studio_test.dart test/suite_test.dart
flutter build web --no-pub --dart-define-from-file=../../firebase-config.json
```

The emulator test uses `demo-tandao`, mocked Paystack checkout and synthetic verified payment payloads. It checks owner/reseller authorization, tenant isolation, immutable invoices, duplicate settlement, domain-payment prerequisites and expired publication removal. Registrar unit tests mock Namecheap; no test purchases a real domain or charges a real card. Live OAuth, Namecheap DNS/TLS, and real provider payments still require configured staging verification.
