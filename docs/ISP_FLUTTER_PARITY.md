# TeknTandao ISP — Native Flutter / HTML parity matrix

The Flutter Workspace retains its **native Material interface**, existing Firebase project, Firebase Auth super-admin gate and Firebase Callable Functions. The separate `chrisndirangu54/HTML` site retains its own database and HTML implementation. This branch **does not** embed an HTML WebView or copy the HTML repository into Flutter.

## Flutter screens and route access

- Super Admin Console → **Full ISP suite**: `apps/dashboard/lib/isp_suite_console.dart`.
- Existing Super Admin Console → **ISP operations** remains in place for the original simplified dashboard.
- Workspace dashboard → **ISP service enquiries** icon: native `IspCustomerPortal` for authenticated, verified-email service requests.
- The new native suite presents responsive navigation on desktop and small screens, data-driven Material input forms, records, audited status transitions, copy-to-clipboard CSV for a loaded subset, admin overview, provider integration statuses, network topology, health samples and an editable KSh pilot revenue/capex calculator.

## Functional areas represented as working management records

| HTML feature | Flutter implementation | Operational limits |
|---|---|---|
| Sites, estates, PoPs and optical distribution locations | `ispSites` | Site planning, not a GIS route solver |
| Device fleet & customer router inventory | `ispDevices` | Management interfaces, revisions, ports, firmware and PoE fields |
| Fiber, PONs, VLAN and wireless links | `ispLinks` | No live switch/OLT commands |
| Subscriber CRM and access type | `ispSubscribers` | Planned only until authorized network adapter connects |
| Subscription plans and pricing | `ispPlans` | Does not update RADIUS policies |
| Telemetry and customer QoE | `ispTelemetry` | Manual samples, no device collector |
| Incidents, technician work orders | `ispIncidents`, `ispWorkOrders` | Audited operator steps, no automated dispatch |
| Support triage | `ispSupportTickets` | Keyword-based classification/human review, not an LLM chatbot |
| Invoice drafts | `ispInvoices` | Draft/issue/void only, never paid |
| M-Pesa/payment reconciliation drafts | `ispPaymentReviews` | Claim references unverified and never settled |
| RADIUS, OMCI, GenieACS, RouterOS provisioning | `ispProvisioningRequests` | Manual-review requests only; never executes |
| Firmware maintenance | `ispFirmwareRequests` | Approval and rollback plans only; never flashes hardware |
| Customer notices | `ispNotificationDrafts` | Drafts only; no WhatsApp/SMS/email dispatch |
| CPE/ONT procurement and CA status | `ispProcurement` | Supplier checks and test tracking |
| Security/VLAN/QoS and firewall change governance | `ispPolicyRequests` | Draft approvals only, no device commands |
| Sales and estate coverage pipeline | `ispOpportunities` | Planning, no automated GIS scoring |
| Customer survey and callback portal | `IspCustomerPortal` and `ispCustomerRequests` | Authenticated verified-email users, consent and 3/day rate limit |
| Sample-based network quality and economics | Native Material dashboard | Heuristics and illustrative KSh scenario, not live financial results |

## Provider readiness

The Flutter suite openly labels MikroTik RouterOS, VSOL GPON, COMFAST network devices, GenieACS, FreeRADIUS, Daraja/M-Pesa, WhatsApp Business, Zabbix/Prometheus and trained predictive models as `not_connected` / `not_verified` / `not_trained`.

These are **not fully implemented production features** until authorized hardware access, credentials, firmware compatibility, M-Pesa merchant verification, payment callback reconciliation, permitted messaging and field validation are completed. No account activation or network configuration can occur in these functions. The supervised model / automatic self-healing layer is intentionally not included.

## Security

- Server-only `isSuperAdminToken` authorization on all ISP suite administration Functions.
- Strict backend schema validation and controlled status transitions.
- The Firestore client is never allowed direct privileged ISP collection writes; server-side Callable APIs write all records.
- Batched/transactional audit entries when creating or transitioning suite records.
- Device references for telemetry/provisioning/firmware; subscriber references for payments, support, invoices and provisioning; invoice references for payment reviews.
- Deterministic document IDs for subscriber codes, invoice codes, plans and payment-provider references prevent accidental duplicate registration.
- Payment review documents cannot be marked `verified` or `paid` from the Flutter client.
- Sensitive device configuration / credentials / payments / firmware jobs never travel through an LLM.
- Verified-email customer enquiries require consent and are limited to three requests per account and UTC day by a server-side transaction.
- CSV copied from the suite is sanitized against formula injection.

## Backend entry points

`functions/src/isp_suite.js` re-exported via `functions/src/platform_entry.js`:

- `ispSuiteCatalog` (admin)
- `ispSuiteDashboard` (admin)
- `ispSuiteRecords` (admin)
- `ispSuiteCreateRecord` (admin)
- `ispSuiteChangeStatus` (admin)
- `ispSuiteCustomerRequest` (signed-in verified-email user, consent, throttled)
- `ispSuiteCustomerRequests` (admin)

Existing `isp_operations.js` functions remain available and use the same established collections for core entities.

## Validation

```bash
npm --prefix functions ci
npm --prefix functions test
cd apps/dashboard
flutter pub get
flutter analyze --no-fatal-infos
flutter test
flutter build web --release --dart-define=PREVIEW=true --no-wasm-dry-run
```

The Node unit tests validate definitions, accepted values, safe state transitions, non-settled payments and client provenance. They do **not** substitute for Firebase emulator integration tests, Flutter widget tests, deployment validation, or hardware acceptance tests.

## Deployment

Merge reviewed code only after CI. The functions are in region `europe-west1`. Configure Firebase project, appropriate service account and API permissions; ensure all listed exports exist after deployment. Callables will fail until they are deployed.

HTML and Flutter data are **intentionally separate**. To unify subscriber and financial information, design an authorized, tenant-scoped synchronization service with explicit consent, idempotency and record ownership; do not silently copy Firestore collections across projects.

## Hardware interoperability and legal validation

The 50-home/200 Mbps/KSh 1,029,687 reference is a design scenario, not a customer count or binding quotation. Confirm actual OLT/ONT compatibility, COMFAST firmware and telemetry interfaces, radio constraints, OLT loss budget, SNMP/MIB coverage, PoE voltage, port speeds, cybersecurity, and Communications Authority of Kenya requirements before deployment.
