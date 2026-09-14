# Firebase Cost Guard

TeknTandao uses Firebase for operational state, realtime collaboration and serverless execution. This cost guard keeps the convenience of Firebase while preventing common read/write amplification patterns as the number of organizations and installed apps grows.

## Client read controls

Production workspaces use `CostAwareFirebaseSuiteStore`.

- Live collection listeners are bounded instead of loading an unlimited collection.
- Identical listeners in the same workspace share one upstream Firestore subscription.
- The upstream subscription is cancelled when the last widget stops listening.
- Read-only `get*` Cloud Functions are cached for a short TTL.
- Identical in-flight read calls are coalesced into one network request.
- Mutations invalidate the callable cache.
- Firestore uses a 100 MB persistent client cache.
- Large product/customer/history views should still add explicit pagination as their specialist UIs mature; the default live limit is a safety ceiling, not a replacement for pagination.

Defaults can be tuned at Flutter build time with:

- `FIRESTORE_LIVE_QUERY_LIMIT` (default 200, clamped to 25–500 in the client)
- `FIREBASE_READ_CACHE_SECONDS` (default 20, clamped to 0–300)

## Business Graph write suppression

The Business Graph trigger calculates a fingerprint of the projected node and edges before and after an operational write. If the graph-visible representation did not change, no Business Graph write is emitted.

This prevents metadata-only changes such as timestamps, sync metadata or agent execution metadata from creating redundant graph writes and downstream trigger fan-out.

## Public website traffic

`resolvePublishedWebsiteExperience` is routed to the cost-aware runtime.

Warm Cloud Functions instances cache:

- custom-domain → public-site mappings,
- published site + ownership metadata,
- experiment definitions,
- immutable published website versions,
- Firebase cost policy.

The cache is deliberately short-lived so publishing and experiment changes propagate quickly without reading the same Firestore documents for every visitor.

Page views and A/B-test exposures are high-volume non-financial telemetry. By default they are sampled at 25% and written as weighted aggregate counters. Conversion events, form submissions and commerce records remain full-fidelity.

The sampling rate is governed by `firebaseFinOps/policy.websiteViewSampleRate` and can be set between 1% and 100%.

## Ephemeral data retention

Firestore TTL is enabled on `expiresAt` for:

- `websiteFormRateLimits`
- collaboration `presence` collection groups

The TTL field is exempted from indexing. This prevents short-lived operational documents and their sequential timestamp indexes from accumulating indefinitely.

TTL deletions still have Firestore delete cost, so TTL is reserved for truly ephemeral records rather than durable business data.

## Firebase FinOps policy

The production Functions entrypoint exposes:

- `getFirebaseCostPolicy`
- `saveFirebaseCostPolicy`
- `getFirebaseFinOpsOverview`

The policy controls the intended cost envelope for daily reads, writes, deletes and function calls plus the public analytics sampling rate. `getFirebaseFinOpsOverview` uses aggregate count queries for a small set of high-growth collections and returns active mitigations and recommendations.

Invoice-grade spend should come from Google Cloud Billing export / Firebase usage metrics. TeknTandao does not manufacture a fake billing total from application counters.

## Default policy

- maximum live documents per listener: 200
- callable read cache: 20 seconds
- daily read budget: 250,000
- daily write budget: 75,000
- daily delete budget: 10,000
- daily function call budget: 100,000
- soft warning: 80%
- hard limit signal: 100%
- public website view/exposure sampling: 25%

The budget thresholds currently produce FinOps state and recommendations. They do not automatically block financial, tax, inventory or user writes; hard throttling business-critical transactions based on an approximate application counter would be unsafe. Future billing-export integration can add verified budget enforcement for non-critical workloads.
