# TeknTandao Hybrid ISP — implementation and pilot reference

## Entry points

- Public responsive HTML page: `apps/dashboard/web/isp/index.html`
- Accessible topology: `apps/dashboard/web/isp/architecture.svg`
- Admin interface: **Platform Super Admin → ISP operations** (`apps/dashboard/lib/isp_admin_panel.dart`)
- Secured Firebase Cloud Functions: `functions/src/isp_operations.js` (re-exported via `platform_entry.js`)

When the Flutter web app is built, the files in `apps/dashboard/web/isp/` are copied to `apps/dashboard/build/web/isp/`. With existing Firebase Hosting configuration, `/isp/index.html` serves the static public page and `/isp/architecture.svg` serves its diagram. This page is independent from the authenticated workspace.

## Proposed deployment reference (NOT live state)

- Upstream internet: 200 Mbps initial planning assumption.
- Core: MikroTik RB5009 providing routing, firewall, PPPoE, queues and RADIUS client.
- GPON: four-port VSOL OLT, two PON interfaces feeding two 1:16 splitters, serving 32 assumed ONTs.
- Wireless distribution: two COMFAST CF-E313AC V2 point-to-point bridge pairs; each remote building uses a managed switch to serve nine customer Ethernet-WAN routers/CPEs.
- Optional COMFAST outdoor APs: common-area Wi-Fi, separate from per-home WAN subscriptions.
- Control components under consideration: Zabbix/Prometheus, FreeRADIUS, GenieACS, billing/CRM, Daraja, technician support and analytics.

COMFAST management interfaces, real bridge throughput, ONT/OLT interoperability, optical losses, PoE requirements, subscriber isolation and Kenyan equipment authorization **are not validated**. Device category availability is not the same as functional interoperability.

## Admin capabilities now implemented

The panel is accessible from the existing Platform Super Admin console.

1. Register ISP network devices with vendor, model, role, site, serial, notes, and planned/installed lifecycle field.
2. Create planned subscriber records (account code, access type, plan bandwidth, site). These **do not activate** live network access.
3. Record, acknowledge and resolve outage incidents with audited state transitions.
4. Open, start and complete field work orders.
5. Review device, subscriber, incident and task records (limited to 100 records per collection for this initial UI).

Callable functions are protected by Firebase Authentication and the existing `isSuperAdminToken` policy on the server. The admin interface makes all writes through callable APIs. Firestore direct client access to these collections is denied by default; the app does not export tokens, write router credentials, or expose public mutate endpoints.

### Firebase callable endpoints

- `ispAdminOverview`
- `ispRegisterDevice`
- `ispAddSubscriber`
- `ispCreateIncident`
- `ispSetIncidentStatus`
- `ispCreateWorkOrder`
- `ispSetWorkOrderStatus`

Firebase Functions region: `europe-west1`.

### Data collections

- `ispDevices`
- `ispSubscribers`
- `ispIncidents`
- `ispWorkOrders`
- `ispAudit`

Each record creation and status update is attributed to the authenticated admin. These are **management records**, not proof of live customer connectivity.

## Not yet connected

- MikroTik API/SSH/SNMP credentials and automatic PPPoE provisioning.
- FreeRADIUS configuration or production RADIUS database.
- GenieACS CWMP connections and real customer telemetry.
- VSOL/COMFAST management or syslog collectors.
- M-Pesa merchant billing and payment verification for **ISP customer** subscriptions.
- Predictive AI model training, autonomous control, automated remediation, or notifications.

Nothing in this implementation attempts live network changes or customer payment operations. Work orders and subscriber planning are metadata-only until the secure provider services are developed and tested.

## Local verification

```bash
npm --prefix functions ci
npm --prefix functions test
cd apps/dashboard
flutter pub get
flutter analyze
flutter build web --dart-define-from-file=../../firebase-config.json
```

Use a valid local Firebase configuration file and do not commit it. For preview testing use `flutter run -d chrome --dart-define=PREVIEW=true`, but **do not mistake preview data for production**.

Verify after building that:
- `build/web/isp/index.html` and `build/web/isp/architecture.svg` exist;
- non-admin authenticated users receive `permission-denied` from the ISP callables;
- incident and work order transitions reject invalid state jumps;
- refreshing the admin page retrieves new records;
- public ISP page does not claim actual service metrics or connected integrations.

## Deployment

Merge the reviewed changes into `main`, execute the existing CI, then deploy through the configured Firebase project after checking that only the intended functions and hosting assets are included. Do not deploy experimental backend integration into a production network without staging.

## Next engineering stages

1. Lab test MikroTik and both proposed customer device types using read-only network telemetry.
2. Validate OMCI/ACS parameters and transparent VLAN transport on actual COMFAST bridge firmware.
3. Add per-organization RBAC for delegated ISP operations instead of super-admin-only access.
4. Provision credentials and subscriptions through separate, audited, idempotent network adapters.
5. Integrate Daraja payments only after merchant onboarding, verified callback handling and financial reconciliation.
6. Add incident correlation and predictive monitoring with observable validation data.
