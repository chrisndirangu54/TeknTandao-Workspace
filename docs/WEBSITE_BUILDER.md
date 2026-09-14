# TeknTandao JSON-First Website Platform

The Website Studio turns `mc14_website_builder` into a visual, runtime-rendered website platform. Validated JSON is the source of truth; Flutter is the controlled renderer. Supported content, layout, CMS, experiment and plugin-fragment changes can therefore publish without rebuilding the installed Flutter runtime.

## Runtime architecture

A website project stores a validated draft, public id, publication versions and a content digest. The runtime accepts a bounded vocabulary of page/section/container, row/column/wrap/stack, typography, image, button, card, grid, navbar, hero, features, pricing, testimonials, CTA, footer and form components.

The server rejects arbitrary inline JavaScript, HTML, CSS, Dart, unsafe URL schemes, duplicate node ids and unbounded trees. Third-party extensibility is provided through capability-scoped remote plugins rather than executing untrusted native code inside a customer app.

Publishing writes an immutable organization version and the public runtime snapshot at `publishedWebsiteSites/{publicId}`. Tenant ownership stays in server-only `websitePublicSiteOwners/{publicId}`.

## CRDT collaboration

Normal visual-editor patches are now routed through the collaboration engine rather than stale-revision rejection.

The collaboration model is an operation-set CRDT:

- edits are immutable semantic patch operations,
- every operation has an actor, monotonically increasing actor clock, operation id and epoch,
- replicas merge by set union,
- materialization uses deterministic Lamport/actor ordering,
- dependency-sensitive operations are replayed until no additional operation can apply,
- presence records expose active collaborators and selected nodes,
- epoch checkpoints compact the collaboration base and create an explicit garbage-collection boundary.

`submitWebsiteCrdtOperation` is available to offline/new clients that maintain their own Lamport clocks. The compatibility `patchWebsiteProject` API allocates a server-side per-actor clock, so the existing visual editor benefits from the same CRDT operation stream without a breaking client migration.

## Custom domains, DNS and SSL

`provisionWebsiteCustomDomain` provisions a Firebase Hosting custom-domain resource. Firebase Hosting remains the certificate authority/orchestrator and automatically manages the TLS certificate after domain ownership and required DNS records validate.

DNS modes:

- `cloudflare`: TeknTandao reads Firebase Hosting's required DNS updates and automatically reconciles A, AAAA, CNAME, TXT and CAA records through the Cloudflare DNS API.
- `manual`: TeknTandao returns the exact required DNS records for registrars/providers without an installed automation adapter; `syncWebsiteCustomDomain` re-checks Hosting ownership/certificate state afterwards.

A domain is marked active only when Hosting reports active host ownership and an active/expiring-soon certificate. `syncWebsiteDomains` reconciles configured domains every 30 minutes. The production runtime resolves the incoming host through the private domain mapping and serves the corresponding published JSON website.

Required/optional configuration:

- `CLOUDFLARE_API_TOKEN` for Cloudflare-managed zones,
- `WEBSITE_FIREBASE_HOSTING_SITE_ID` when the Hosting site id differs from the Firebase project id,
- `WEBSITE_CERT_PREFERENCE` to override the default dedicated certificate preference.

The Firebase service identity used by Functions must have permission to manage Hosting custom domains.

## Asset CDN uploads

Website assets use a signed-upload/finalize flow:

1. `createWebsiteAssetUpload` validates the requested file and returns a short-lived V4 signed Cloud Storage PUT URL.
2. The editor uploads directly to the staging object.
3. `finalizeWebsiteAssetUpload` checks the stored content type and size, moves the object to an immutable final path and assigns a download token.
4. Final media is served with `Cache-Control: public,max-age=31536000,immutable`.

Allowed assets are passive image/video/PDF/WOFF2 types; active SVG/HTML/script uploads are rejected. Direct Firebase Storage client reads/writes are denied by `storage.rules`; public media uses per-object download-token URLs.

Configuration:

- `WEBSITE_ASSET_BUCKET`, or the Firebase app's configured Storage bucket.

## Headless CMS and data bindings

The builder now includes typed CMS collections with field types:

- text / long text,
- number / boolean,
- date / datetime,
- URL / image,
- reference,
- bounded JSON object.

Collections can mark individual fields public/private and can enable public runtime reads. Only published CMS entries are returned publicly, and private fields are stripped server-side.

Any component can become a CMS repeater using a scalar `dataCollection` prop and optional `dataLimit`. Child component strings support `{{field}}` and dotted-path interpolation. This preserves the closed JSON schema while allowing real content/data-driven sites.

## Third-party plugins

Plugins are open to arbitrary third-party publishers but execute out-of-process at publisher-controlled HTTPS endpoints. This is the security boundary that permits extensibility without giving templates arbitrary code execution inside the customer's Flutter process.

Plugin manifests declare explicit capabilities such as:

- `site.fragment` / `site.data`,
- `cms.read` / `cms.write`,
- `forms.receive`,
- `automation.emit`,
- `analytics.write`,
- `asset.read`.

Installation grants are stored per organization. Invocations carry an HMAC-derived installation credential from `WEBSITE_PLUGIN_SIGNING_SECRET`. A plugin may return bounded JSON data or a visual fragment; fragments must pass the same TeknTandao website-node validator before rendering. Public-site invocation additionally requires `publicRuntime: true`.

## Public forms and spam protection

Published form submissions are server-authoritative through `submitPublishedWebsiteForm`.

The production pipeline includes:

- verification that the submitted form exists in the published document,
- bounded field validation,
- HMAC-hashed requester identity rather than storing raw visitor IPs,
- a per-site/per-requester rolling rate limit,
- honeypot detection,
- minimum-submit-time heuristics,
- link/repetition/known-spam scoring,
- optional Cloudflare Turnstile verification,
- separation of accepted submissions and spam quarantine,
- aggregate daily form/spam counters,
- conversion attribution when an experiment exposure token is present.

`TURNSTILE_SECRET_KEY` enables Turnstile verification. Forms do not require CAPTCHA by default; sites can enable `requireCaptcha` when the public client supplies a Turnstile token.

## Runtime A/B experiments and conversion analytics

Experiments point to immutable published website versions. Each experiment supports:

- 2-8 variants,
- exact basis-point weights totalling 10,000,
- partial traffic allocation,
- URL-path targeting,
- start/end scheduling,
- named conversion goals.

`resolvePublishedWebsiteExperience` creates a deterministic sticky assignment from an HMAC visitor hash, returns the selected published document and a signed 24-hour exposure token. Raw visitor identifiers are not persisted.

`recordWebsiteConversion` accepts only signed exposure tokens and configured events. Daily site views, experiment exposures, conversions and form outcomes are stored as aggregates for the owner dashboard.

Configuration:

- `WEBSITE_ANALYTICS_SIGNING_KEY`.

## Template marketplace and creator payouts

Templates remain versioned JSON products with KES pricing, content digests, licensing metadata, verified Paystack/M-Pesa purchase entitlement, install counters and creator earnings.

Creator payout automation is implemented through Paystack Transfers:

1. the creator configures a supported KES transfer recipient,
2. pending earnings are transactionally claimed into one payout job,
3. the platform initiates the Paystack transfer,
4. direct signed transfer webhooks and a scheduled 15-minute reconciliation job independently verify the transfer through Paystack,
5. earnings become `paid_out` only after provider verification reports success,
6. failed/reversed payouts return their earnings to the pending state.

Supported payout profile types are `mobile_money`, `mobile_money_business` and `kepss`, subject to the connected Paystack account's live-country/provider availability and recipient codes.

Configuration:

- `PAYSTACK_SECRET_KEY`,
- `WEBSITE_MARKETPLACE_FEE_BPS` for marketplace commission.

## AI generation and scaffold export

`generateWebsiteFromPrompt` asks the configured Gemini model for schema-constrained JSON and validates that output through the same server validator before it can become a project.

Configuration:

- `GEMINI_API_KEY`,
- `GEMINI_MODEL`.

`exportWebsiteFlutterScaffold` continues to provide an independently deployable Flutter/Firebase starting point with bundled JSON fallback. TeknTandao's hosted runtime uses the richer experience resolver for custom-domain routing, CMS, plugins, forms and experiments.

## Security model

- Website project and infrastructure mutations are callable/server-authoritative.
- All direct Firestore client writes remain denied.
- Published runtime JSON is public by opaque id but cannot be listed.
- Tenant/domain ownership mappings are server-only.
- Collaborators can read authoring/CMS/asset/collaboration data only with Website Builder entitlement.
- Release history, domains, analytics, submissions, spam quarantine and payout records are owner-only.
- Storage writes use short-lived signed URLs and immutable finalized paths.
- Plugin code never executes directly inside the customer Flutter process.
- Marketplace purchase entitlements and creator payout state close only after provider verification.

## Deployment checklist

To turn every provider-backed path on in production, configure the relevant credentials and provider accounts rather than substituting demo responses:

- Firebase Hosting site + service-account permission for custom domains,
- Cloudflare API token and per-domain Zone ID for automatic DNS,
- Firebase Storage bucket/signing capability,
- `WEBSITE_PLUGIN_SIGNING_SECRET`,
- `WEBSITE_ANALYTICS_SIGNING_KEY`,
- optional `TURNSTILE_SECRET_KEY`,
- Paystack live transfer capability/recipient codes,
- Gemini configuration for AI generation.

These are deployment credentials and external-provider approvals, not missing application logic. Provider-specific restrictions still apply—for example, an organization cannot automate DNS for a registrar/zone it has not authorized, and a Paystack account cannot send a payout rail that Paystack has not enabled for that account.
