# TeknTandao Workspace — Logistics Intelligence Hub

## Shipped in the first implementation
The existing Fleet and Freight apps now share a logistics control tower backed by Firebase callable Cloud Functions in `functions/src/logistics.js`. Unlike the legacy Fleet dashboard, all shipment KPIs come from workspace records; no sample vehicles, fuel volumes or claimed trip counts appear as actual data.

Implemented:
- Workspace-isolated shipment register with reference deduplication, currency, declared value, origin, destination, mass, transport mode, assigned carrier and tracking number
- Controlled shipment status transitions and immutable timestamped milestone events
- Operator-managed carrier profiles and indicative tariff comparison (explicitly NOT live commercial quotes)
- Fleet vehicle profiles with capacity, availability and assigned driver
- Explainable capacity-based packing proposal for eligible shipments; no claim of traffic-aware optimization or automatic dispatch
- DHL Unified Tracking read-only adapter through provider API, guarded by an owner permission and `DHL_UNIFIED_API_KEY` Firebase Secret Manager secret. It returns tracking events without changing internal shipment status.
- Secure generic B2B milestone webhook, with one-time per-company integration tokens, 90-day expiry, SHA-256 token storage, carrier-to-shipment binding, transactional status transitions and event-ID deduplication. Partner must implement the Workspace webhook contract; this is not a native provider API.\n- Company-provider catalogue for DHL, FedEx, UPS, Aramex, G4S, Fargo and independent 3PLs. **Only DHL has a coded external tracking request**. Other names are onboarding entries, not connected accounts.

### Installation and deployment
1. Deploy Firebase Cloud Functions from `functions/src/platform_entry.js`, which exports the new logistics callables.
2. Install either Fleet (`fleet`) or Cargo Freight (`freight`) in the workspace. The customer must be a workspace member with a valid app subscription.
3. Optionally obtain approval and an API subscription from DHL: https://developer.dhl.com/api-reference/shipment-tracking
4. In the Firebase project, configure `DHL_UNIFIED_API_KEY` through Firebase Secret Manager following your organization's secrets process; never put keys in Flutter, Firestore, client environment variables or source control.
5. Run `cd functions && npm ci && npm test` and `cd apps/dashboard && flutter analyze && flutter test`, then deploy functions and the Flutter app through the existing CI pipeline.

### API contract (Firebase callable, europe-west1)
Every call automatically includes the active `orgId` through `SuiteStore.call`.
- `logisticsControlTower()`: limited current snapshot (up to 150 shipments; 100 carriers and vehicles). Add cursor pagination before large scale.
- `logisticsCreateShipment({shipment})`: server-validated draft record, unique normalized reference
- `logisticsRecordMilestone({shipmentId,event:{status,location,note}})`: transactional lifecycle update and event log
- `logisticsRegisterCarrier({carrier})`: owner-only; accepts tariff inputs, does **not** establish API credentials
- `logisticsRegisterVehicle({vehicle})`: owner-only capacity registry
- `logisticsCompareTariffs({shipmentId})`: operator-entered nonbinding rates
- `logisticsDispatchProposal()`: capacity heuristic only, nonoptimal, requires dispatcher review
- `logisticsTrackDhl({shipmentId})`: owner-only, read-only external DHL request; requires provider approval and configured secret\n- `logisticsIssuePartnerToken({carrierId})`: owner-only, generates a one-time secret for a registered carrier, valid for 90 days; old token immediately rotated\n- `logisticsRevokePartnerToken({carrierId})`: owner-only key revocation\n- `logisticsPartnerWebhook`: HTTPS POST event ingestion with bearer key, workspace ID and carrier ID; events are checked against the shipment assignment and deduplicated

### Data and security
All records are stored under `organizations/{orgId}/logisticsShipments`, `logisticsMilestones`, `logisticsCarriers` and `logisticsVehicles`. These are managed by Admin SDK Cloud Functions, not publicly exposed client-side collections. Every function verifies Firebase Auth, organization membership, and an active Fleet or Freight subscription using existing `canAccess` rules. Carrier/vehicle onboarding and external DHL lookups require a workspace owner. Client-provided webhook URLs and API secrets are not accepted. The optional B2B webhook issues a dedicated bearer token once to the workspace owner and stores only its SHA-256 digest. The token controls one registered company's event-writing access, never customer list access.

**Caveats:** Provider onboarding does not equal partner contract; the current routing heuristic does not include roads, restrictions, GPS feeds, live traffic, or optimized ETAs. Freight quotes are estimates only, customs compliance is a workflow flag rather than an integrated government declaration, no payment ledger posting occurs and proof-of-delivery signatures are not yet captured. No public tracking link is produced, preventing unintended disclosure of customer shipment details.

## Phase-two architecture for state-of-the-art logistics
- **True optimization:** OR-Tools for capacitated vehicle routing, time windows, pickup/delivery, driver hours; Valhalla or OSRM for road-network travel times, routing matrix and restricted road profiles, with recorded solver gaps.
- **Live fleet telemetry:** Traccar (open source) with tenant-specific device IDs, signed ingestion, consent-aware driver tracking, geofences and event deduplication.
- **Carrier connectors:** provider-specific adapters with explicit customer credentials (DHL shipping/rating, FedEx OAuth, UPS OAuth, Aramex and approved Kenyan courier partnerships). Add per-tenant secrets, retries, replay prevention, rate limits, idempotency, sandbox verification and error mapping. Never make a speculative call to an undocumented carrier API.
- **Logistics finance and operations:** freight tenders, SLA windows, rate cards, invoice matching, COD/M-Pesa settlement reconciliation, claims and returns; keep accounting posting in the existing ledger workflows.
- **Warehouse interoperability:** WMS putaway/pick-pack-ship, batch/serial and temperature probes; enforce atomic inventory reservations and traceability.
- **Cross-border:** shipping documents, container events, border clearance milestones, export controls and RECTS only through authorized providers and applicable regulator interfaces.
- **Analytics:** ETA distributions and uncertainty, exception attribution, cost-per-delivery/tonne/km, return-leg utilization, carbon reporting based on measured fuel data, drift monitoring and simulation backtests.

## Acceptance criteria for enterprise release
Instrumented GPS and route-matrix tests, real provider sandbox tests, Firestore emulator multi-tenant isolation tests, least-privilege role tests, webhook signature and replay tests, load tests over 10,000 shipments, resilience to tracking outages, key rotation, retention/deletion policies, and documented accuracy metrics for ETA/route recommendations. Complete these before advertising live carrier booking, AI-dispatched fleet or customs filing.

### External carrier callback contract (approved 3PL partners)
The partner sends a POST to the deployed `logisticsPartnerWebhook` HTTPS URL (obtain it from Firebase Functions deployment output, do not guess the URL), over TLS, with headers:

```http
Authorization: Bearer tfl_<one-time-secret>
x-workspace-id: <workspace-id>
x-carrier-id: <registered-carrier-id>
Content-Type: application/json
```

```json
{"eventId":"carrier-unique-event-123","shipmentId":"existing-shipment-id","trackingNumber":"optional-waybill","event":{"status":"in_transit","location":"Nairobi depot","note":"Scanned by carrier"}}
```

The tracking number must match the shipment if provided. State changes must follow the legal workflow; identical partner event IDs cannot apply twice. An approved partner should use a secure vault for the token, send only the minimum shipment data, and treat credentials as confidential. Put the endpoint behind API Gateway with quota enforcement and additional network/rate limits before a broad public production launch. No automatic carrier financial transactions are allowed through this webhook.
