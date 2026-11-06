# Logistics Intelligence Phase 2 — OR-Tools, Valhalla and Traccar

This is the **second-stage implementation** of the [Logistics Intelligence Hub](LOGISTICS_INTELLIGENCE_HUB.md). It is an opt-in and fail-closed extension of the Fleet and Freight apps. The legacy capacity-first proposal remains available, but must not be confused with the verified road-network optimizer.

## Delivered components

| Component | Implementation | Live dependency |
|---|---|---|
| Route planning | Firebase `logisticsOptimizeRoadRoutes` persists a bounded, owner-created proposal | Private optimizer URL plus service key |
| Optimization | FastAPI microservice with Google OR-Tools CVRPTW (capacity and delivery time windows) | Container runtime with OR-Tools |
| Travel-time matrix | Valhalla `POST /sources_to_targets` with verified road distances/times | Configured Valhalla with licensed or compliant road graph |
| Plan review | Firebase `logisticsApproveRoutePlan` transactionally reserves vehicles and assigns shipments | Explicit workspace-owner confirmation |
| Geocodes | `logisticsSetDestinationCoordinates` records manually confirmed lat/lon and minutes-after-midnight delivery windows | Real ground-truth coordinates |
| GPS | `logisticsTraccarSnapshot` owner-only GET of latest Traccar fixes | Operator-managed server URL, Traccar token, approved device bindings |
| Device mapping | `logisticsProvisionGpsDevice` and `logisticsRevokeGpsDevice` limited to platform administrators | Firebase Auth custom claim `logisticsAdmin: true` |
| Interface | Fleet and Cargo Freight share map-ready coordinate/GPS panels, route summaries and an explicit plan approval button | Deployed Flutter app and Functions |

**Status:** Source integration and tests are provided in the repository; this does not mean any provider, server, customer device, road matrix or model is deployed or connected. Do not advertise live fleet coverage before integration acceptance tests are executed.

## Environment and access control

For Firebase Functions, configure:
- `LOGISTICS_OPTIMIZER_URL`: a **server-controlled public HTTPS** base URL for your private optimizer service. Authenticate requests at the service boundary; do not accept user-provided destinations or request URLs.
- `LOGISTICS_OPTIMIZER_KEY`: Firebase Functions secret mounted only in `logisticsOptimizeRoadRoutes` and matching the optimizer's environment variable.
- `TRACCAR_BASE_URL`: server-controlled public HTTPS origin of an authorized Traccar instance. For private Traccar, put a protected TLS gateway in front; do not expose the management console unauthenticated.
- `TRACCAR_API_TOKEN`: Firebase Functions secret authorized to read positions from the instance.

For the separate Python optimizer service:
- `LOGISTICS_OPTIMIZER_KEY`: same shared secret, never placed in Flutter, Firestore or GitHub.
- `VALHALLA_URL`: trusted HTTP(S) base for your self-hosted Valhalla service. A private network/internal service URL is permitted here because **only the service operator**, not a workspace user, controls this configuration.
- The public optimizer service endpoint must use TLS, authentication, rate limiting, private service-to-service authentication, and network restrictions.

Do **not** pass customer names, addresses, phone numbers, tracking numbers or warehouse authentication tokens to the optimization microservice. It receives only pseudonymous shipment/vehicle IDs, WGS84 coordinates, capacities and time windows. Coordinates may still be sensitive; configure an appropriate processor agreement and retention controls.

## Workflow

1. Install Fleet or Freight in the selected Workspace. Create shipments and fleet vehicles and verify that the fleet is available.
2. A workspace owner records a **verified destination latitude/longitude** for each eligible road/courier shipment. No address geocoding is guessed by the model.
3. The owner provides depot coordinates and asks the optimizer to plan routes.
4. The Firebase function loads no more than 150 shipments / 100 vehicles, and prepares up to **30 eligible stops and 12 vehicles** per solve. Unsupported, missing-coordinate, overweight and invalid-window shipments are disclosed separately as exclusions.
5. The Python optimizer requests an actual road time/distance matrix from Valhalla and uses OR-Tools to produce capacitated, delivery-window-constrained vehicle routes. It allows unassigned stops rather than fabricating feasibility.
6. Firebase verifies that every routed shipment is accounted for, persists a proposed plan, and sends the plan to the dashboard with predicted route distance and ETA in minutes relative to departure day at midnight.
7. The owner must explicitly confirm approval. Firebase atomically reserves vehicles, records the route-plan ID and assigns shipments; a status change or unavailable vehicle blocks approval. It does **not** automatically book a carrier, start travel, post accounting transactions or contact drivers.

The current model assumes **one common depot, one-day delivery windows, all cargo loaded at depot, static Valhalla road-network times, no driver-hour laws or hazardous-material restrictions**, and is a bounded heuristic search (five seconds), **not proven globally optimal**. Treat predicted ETAs as estimates, not live-traffic SLA guarantees. Driver shift constraints, road width/height/weight access, emissions accounting, multi-depot routing and vehicle operating costs remain future work.

## GPS device ownership and consent

Only a Firebase Auth account with the **server-issued** `logisticsAdmin: true` custom claim may provision/unlink a tracking device. The admin must record a tracking-consent reference before linking a specific device ID to a specific organization's vehicle. The unique global `logisticsDeviceBindings/{deviceId}` document stops reassignment across tenants. Explicit revocation removes the binding. Firebase client-side rules do not permit direct reads or writes to this global collection.

`logisticsTraccarSnapshot` requires owner rights, an active Fleet or Freight subscription and configured Traccar access. It retrieves latest positions from the configured instance and **only returns records matching approved tenant bindings**. It discards invalid/future/older-than-24h fixes, flags positions older than 10 minutes, converts device speeds reported in knots to km/h, and never exposes other tenants' records. It is an **on-demand snapshot, not a WebSocket live stream**.

For high-frequency real-time updates, deploy a separate authenticated relay using Traccar's WebSocket service and per-tenant authorized subscriptions, with backpressure, device privacy safeguards and retention policies; this is **not part of this release**.

## Development and verification

```bash
cd functions
npm ci
npm test
cd ../apps/dashboard
flutter pub get
flutter analyze
flutter test
cd ../../services/logistics_optimizer
python -m pip install -r requirements.txt
python -m pytest -q test_app.py
```

Build optimizer container from repository root:
```bash
docker build -f services/logistics_optimizer/Dockerfile -t tekntandao/logistics-optimizer:dev .
```

Both Node and Python test jobs run in the GitHub Actions CI workflow. The optimizer requires a working Valhalla instance with road tiles; tests use synthetic matrix fixtures for **solver logic only**, and do not establish live route accuracy. Before production acceptance test with actual road networks, zero/very short roads, disconnected components, slow provider responses, multi-tenant access, GPS permission revocation, stale positions and 30-stop throughput.

## References
- Valhalla matrix API: https://valhalla.github.io/valhalla/api/matrix/
- OR-Tools CVRPTW: https://developers.google.com/optimization/routing/vrptw
- Traccar API: https://www.traccar.org/traccar-api/

