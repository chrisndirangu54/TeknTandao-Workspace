# Fleet Yangu ↔ TeknTandao Workspace connector

## Implementation

TeknTandao Workspace now includes an opt-in Fleet Yangu connector, while both apps retain independent Firestore projects and organization authorization.

Server module: `functions/src/fleet_yangu_connector.js`; pure security and normalization helpers: `functions/src/fleet_yangu_domain.js`; tests: `functions/test/fleet_yangu_domain.test.js`; dashboard: `apps/dashboard/lib/modules/fleet_module.dart`.

### Authenticated callable operations (europe-west1)

| Function | Owner workflow |
|---|---|
| `logisticsConnectFleetYangu` | Verify source organization/token remotely, encrypt key with AES-256-GCM and store under Workspace integration metadata |
| `logisticsFleetYanguStatus` | Read connection status; never reveal bearer key |
| `logisticsFleetYanguVehicles` | Fetch bounded and sanitized vehicle-health, fleet-risk, engine, alert and maintenance snapshots |
| `logisticsLinkFleetYanguVehicle` | Bind a registered Workspace vehicle to a verified Fleet Yangu vehicle with unique owner-approved ID mapping |
| `logisticsUnlinkFleetYanguVehicle` | Revoke a single per-Workspace vehicle link |
| `logisticsSendFleetYanguDispatch` | Explicit owner-confirmed, idempotent shipment handoff to the paired Fleet Yangu dispatcher |
| `logisticsDisconnectFleetYangu` | Remove encrypted Workspace credential; also revoke key at source for immediate invalidation |

### Provisioning

1. First deploy the **Fleet Yangu** side of the bridge (see its `docs/WORKSPACE_INTEGRATION.md`). Source owner issues a one-time 90-day integration key for the exact Workspace organization ID. Read-only is default, optional dispatch permission must be explicitly enabled.
2. Configure in Workspace Functions runtime:
   - `FLEET_YANGU_BRIDGE_URL`: trusted, platform-controlled deployed Fleet Yangu HTTPS function URL, e.g. the complete URL ending in `/fleetYanguWorkspaceBridge` before the appended `/v1/vehicles`.
   - Firebase Secret Manager `FLEET_YANGU_ENCRYPTION_KEY`: random **32-byte key encoded in base64**, injected only into connector callables; keep existing version(s) available until all tenant credentials are re-encrypted during rotation.
3. Deploy Workspace Functions and dashboard. The Workspace owner opens Fleet/Freight → Fleet Yangu and enters the Fleet Yangu organization ID and one-time bearer token.
4. Click **Refresh vehicle intelligence**, choose Fleet Yangu vehicle → **Link** → matching registered Workspace vehicle. Source IDs are never inferred from a number plate alone.
5. Create, assign and book a shipment in Workspace. Only a linked and adequately healthy vehicle can be submitted to Fleet Yangu for dispatcher review. This does not notify drivers, accept a job, book external carriers or control vehicle hardware.

### Boundaries and limitations

- Cross-project access uses server-to-server authorized HTTPS; neither Firebase project shares administrator credentials with the other.
- Workspace Firestore is default-deny for non-app connector storage, and tenant keys are AES-256-GCM encrypted at rest with the runtime secret. Never return tokens or ciphertext to Flutter.
- Workspace owner and active Fleet/Freight entitlement are required for all connector calls.
- Fleet Yangu source bearer is scoped to exact source/target org IDs, has a 90-day expiry and can be revoked.
- Source data is sanitized and bounded at 100 records per category, with no assumed real-time connectivity.
- Risk-gating refuses a handoff when Fleet Yangu reports health under 50/100, risk at or above 75/100 or a critical *open* safety alert. These are provisional operator-policy thresholds, not validated clinical/engineering safety certifications.
- Dispatch creates a **request pending fleet dispatcher review**, not an automatic trip, not an on-road action and not a CAN/ECU command.
- GPS/Traccar, Valhalla and OR-Tools remain separately managed in [phase 2](LOGISTICS_INTELLIGENCE_PHASE2.md); the associated PR has not necessarily been merged. This connector runs independently against the current Fleet/Freight module.
- Production acceptance: test revocation, cross-tenant mismatch, key rotation, direct Firestore rules, stale diagnostic data, source outages, duplicate dispatch, partial downstream failure and rate limits. No external fleet data has been connected in this source change.
