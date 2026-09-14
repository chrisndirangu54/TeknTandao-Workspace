# TeknTandao JSON-First Website Studio

The Website Studio turns the existing `Website Builder` catalogue app (`mc14_website_builder`) into a visual, runtime-rendered website platform rather than a conventional compile-time page generator.

## Core model

The validated website JSON document is the source of truth. A project stores a draft document, an optimistic `revision`, a stable public site id and version metadata. Visual edits are submitted as bounded node patches instead of arbitrary source code.

Supported patch operations are:

- update a node's props/style/responsive values/action,
- insert a validated component,
- remove a component,
- move a component,
- update a page,
- replace theme tokens.

Every edit requires the current revision. A stale editor receives a revision conflict instead of silently overwriting a newer change. Edit events are retained for audit/history.

## Live publishing without rebuilding Flutter

Publishing validates the whole document, stores an immutable organization version and atomically updates:

`publishedWebsiteSites/{publicId}`

That public document contains only runtime publication data (public id, version/revision, digest, document and publication timestamp). Internal organization ownership is held separately in server-only `websitePublicSiteOwners`, so the public runtime document does not disclose the internal tenant id.

Generated Flutter projects listen to the published Firestore document. The generated app also contains a bundled JSON fallback. Content and supported layout changes therefore become visible after a JSON publish without recompiling or redeploying the Flutter client.

A rebuild is still required when the runtime itself changes—for example when adding a brand-new executable widget type or native capability that the installed runtime does not understand.

## Closed component schema

Templates and AI output cannot inject arbitrary JavaScript, HTML, CSS, Dart, Firebase paths or executable plugins. The runtime uses a bounded component vocabulary including page/section/container layout, rows/columns/wrap/stack, typography, images, buttons, cards, grids, navbar, hero, features, pricing, testimonials, CTA, footer and forms.

The server validates:

- unique stable node ids,
- maximum pages, nodes and tree depth,
- supported node types,
- scalar props,
- colors and numeric style limits,
- mobile/tablet/desktop/wide responsive overrides,
- safe navigation/external URL actions,
- document size before Firestore writes.

Only `http`, `https`, `mailto` and `tel` external URL schemes are accepted.

## Visual Studio

The Flutter editor provides:

- mobile, tablet and desktop preview widths,
- draggable component palette,
- click-to-select canvas nodes,
- in-place property/style inspector,
- theme editing,
- multi-page projects,
- JSON inspection/copy,
- AI website generation when Gemini is configured,
- Flutter/Firebase scaffold export,
- live publishing,
- direct `Sell as template` creator action,
- marketplace and creator dashboards.

The production project collection is streamed through Firestore, so collaborators see current project documents while server-side revision checks protect concurrent edits.

## AI generation

`generateWebsiteFromPrompt` asks the configured Gemini model for schema-constrained JSON and then validates the result using the same server validator as manually created sites. Model output is never trusted as executable code.

Required production configuration:

- `GEMINI_API_KEY`
- `GEMINI_MODEL`

If they are absent, AI generation fails closed rather than pretending to work.

## Flutter + Firebase scaffold export

`exportWebsiteFlutterScaffold` returns a deterministic project scaffold containing:

- `pubspec.yaml`,
- `lib/main.dart`,
- `assets/site.json`,
- `firebase.json`,
- `README.md`.

The scaffold initializes Firebase, listens to the live publication document and falls back to the bundled document if no remote snapshot is available. It can therefore be used as an independently deployable Flutter/Firebase starting point while preserving TeknTandao's runtime JSON model.

## Template Marketplace

Owners can publish a project as a versioned template with:

- creator identity/display name,
- description/category/tags,
- content digest and version,
- KES price in minor units,
- `free`, `single_use`, `commercial` or `extended` licensing metadata,
- sales and install counters.

Installing a paid template requires an organization entitlement. A buyer cannot bypass the server and install a paid template by editing Firestore directly.

### Verified checkout

Paid template checkout supports the platform's existing verified payment providers:

- Paystack initialization + signed webhook + independent transaction verification,
- M-Pesa STK initiation + Daraja transaction query verification.

Only a verified successful transaction grants the buyer entitlement. Purchase references and settlement are replay-safe/idempotent at the entitlement layer.

### Creator earnings

A verified sale creates a seller earning record with gross amount, configurable platform fee, seller net and payout state. `WEBSITE_MARKETPLACE_FEE_BPS` controls the marketplace fee and defaults to zero when not configured.

Automated creator payouts are **not** claimed. Earnings remain `pending_payout` until a real compliant payout rail and payout/reconciliation process is configured.

## Security boundaries

- Website project writes are callable/server-authoritative.
- Entitled Website Builder collaborators can read project JSON.
- Project edit history, publication versions and creator earnings are owner-only for direct reads.
- Published site JSON supports public single-document reads but cannot be listed through Firestore rules.
- Public site ownership/reservation metadata is not public.
- All client writes remain denied by the global Firestore write rule.
- Marketplace payment state and entitlements are created server-side after provider verification.

## Current production boundaries

The implemented platform is intentionally honest about what remains outside this tranche:

- custom-domain DNS/SSL provisioning and automated Firebase Hosting deployment,
- automated creator payouts,
- public form-submission backend/spam protection (the form component is currently a visual/runtime primitive),
- uploaded asset/CDN management,
- arbitrary third-party plugin execution,
- true CRDT-style simultaneous editing; current collaboration is live-document + optimistic revision conflict handling,
- advanced CMS/data bindings and reusable cross-project design-system packages,
- runtime A/B experimentation and conversion analytics.

These can be layered onto the JSON runtime without changing the core principle: website state remains validated data, while the Flutter runtime remains a controlled renderer/executor.
