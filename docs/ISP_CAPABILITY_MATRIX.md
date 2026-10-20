# ISP capability implementation matrix — October 2026

This inventory covers the features requested in the TeknTandao hybrid ISP discussion. It deliberately separates actual code from proposals, staging-only components, third-party configuration and unsupported claims. The Flutter app remains authoritative for workspace operations; the HTML public edition lives in `chrisndirangu54/HTML` and has a separate Firebase project.

## Functional state definitions

- **Implemented**: source code and automated unit tests exist; still requires project CI, security review and deployment.
- **Partial**: safe APIs, workflow records or deterministic evaluation exist, but live integration or a major user interaction is missing.
- **Blocked**: hardware, provisioning, payment or regulatory information outside this repo is needed.
- **Planned**: no production implementation; architecture or vendor selection only.

| Capability discussed | Current scope | State | Go-live acceptance requirement |
|---|---|---|---|
| Hybrid GPON and wireless topology | SVG/HTML in separate HTML repo; Flutter architecture overview | Implemented (reference) | Perform site RF/optical/link survey and approve topology |
| Network device inventory | Register device and hardware revision metadata | Implemented | Role authorization, audit, duplicate-serial protection and asset reconciliation |
| Subscriber planning and isolation | Accounts, plan speed, site and access type records | Partial | Real PPPoE/VLAN/RADIUS provisioning, accounting and isolation tests |
| Router/ONT diagnostics | Validated admin-submitted latency, jitter, loss, utilization | Partial | Secure SNMP/RouterOS/OLT/ACS telemetry collector and signal provenance |
| Topology correlation | Device/segment heuristic identifies common critical readings | Partial | Validate time windows and topology against actual faults |
| Incident tracking | Open/acknowledge/resolve with audit | Implemented | Technician acceptance and SLA workflow |
| Technician tasks | Open/in-progress/completed with audit | Implemented | Mobile dispatch, GIS, images and field sign-off |
| Bandwidth forecasting | Limited-sample heuristic and capacity review suggestions | Partial | Multi-week timestamped samples, quality checks and forecast backtesting |
| Wi-Fi RF fault diagnosis | Network-quality metrics and triage guidance only | Planned | CPE Wi-Fi radios expose RSSI, retries, channel congestion and coverage evidence |
| Outage alerts and notifications | Incident records only | Planned | Verified outage detector, approved SMS/WhatsApp consent and rate limiting |
| Self-healing/autonomous networking | No live write path, intentionally | Blocked | Human approvals, safe list of actions, retries, rollback and change-impact simulation |
| M-Pesa ISP billing and subscriptions | Architecture described; no ISP payment adapter | Blocked | Merchant consent, Daraja credentials, verified STK/C2B lifecycle, ledger and reconciliation |
| Customer app and self service | Flutter framework exists; ISP customer experience pending | Planned | Subscriber identity, billing view, usage consent, ticketing and notifications |
| WhatsApp support | Keyword-based support triage API | Partial | Official WhatsApp Business setup, message templates, consent, agent handoff and real account verification |
| Predictive churn | Bounded service-recovery heuristic, explicitly not trained | Partial | Quality-controlled customer history, validated model, fairness and intervention outcomes |
| Customer experience analytics | Sampling summaries and bounded risk | Partial | Measured outage durations, ticket events, NPS/CSAT with privacy safeguards |
| Wireless equipment integration | COMFAST candidates identified | Blocked | Vendor API/MIB proof, VLAN transparency, revision-specific RF performance, approvals |
| GPON OLT/ONT integration | VSOL/Huawei/other candidates and standards identified | Blocked | Firmware-supported OMCI profiles, signal budget, ONT acceptance testing |
| GenieACS device fleet management | Protocol and tooling specified | Blocked | Secure ACS with customer-trusted credentials and tested CWMP data models |
| Firmware control and recovery | Procurement requirements documented | Blocked | Vendor signing, image validation, maintenance windows, staged rollouts and recovery |
| Business expansion GIS | Site field on all records | Planned | Consent-based geospatial assets, costs, demand and path feasibility |
| Anti-abuse and security analytics | Centralized admin authorization/audit | Partial | Abuse intake, log retention, rule tuning, customer privacy reviews and regulatory readiness |
| PoE/VLAN/port compatibility | Procurement policy and checklist | Partial | Vendor datasheets, power budgets, switch configuration/bench test |
| ISP licensing/CA approvals | Requirements documented | Blocked | Confirm applicable licenses, product type approval and lawful radio operation |
| Monetary profitability model | Estimates only in discussion, not actual invoices | Planned | Verified unit economics, taxes, contracts and uptime costs |

## Current Cloud Functions

- `ispAdminOverview`, `ispRegisterDevice`, `ispAddSubscriber`
- `ispCreateIncident`, `ispSetIncidentStatus`
- `ispCreateWorkOrder`, `ispSetWorkOrderStatus`
- `ispRecordTelemetry`, `ispTelemetrySummary`
- `ispRequestProvisioning`, `ispListProvisioningRequests`
- `ispCreateSupportTicket`, `ispSupportOverview`
- `ispDecisionSupport`

These endpoints are authenticated super-admin operations. Their existence does **not** demonstrate live device control, successful external payment processing or production AI prediction. Readings are tagged `source: manual_admin`; provisioning requests are non-executing approvals. Ticket classification is a transparent keyword triage rule.

## External inputs needed before live commissioning

1. Exact MikroTik hardware and RouterOS version plus management IP/network; create limited read-only network credentials in a secure secret store (never Git).
2. VSOL OLT model, firmware, PON ports, accepted ONT vendor/firmware matrix, optical-loss budget and customer topology.
3. COMFAST hardware revisions, PoE specs, syslog/SNMP/API references, RF survey, VLAN transparent-bridge test results.
4. GenieACS deployment plan, endpoint TLS certificates, device-authentication policy and per-model provisioning templates.
5. RADIUS server integration and automated PPPoE/accounting adapter with dry-run and approval checks.
6. M-Pesa Daraja approved shortcode/merchant contract, sandbox credentials and verified callback/reconciliation setup.
7. WhatsApp Business Platform phone number, templates, opt-in data, handoff destination and data retention policy.
8. Customer and technician authorization model, customer consent/legal basis, company licensing and local type-approval evidence.

## Safety guardrails

- Do not let an LLM execute RouterOS scripts or change subscriber access.
- Preserve customer connectivity when AI or billing infrastructure is offline; avoid automatically disconnecting subscribers on unverified payments.
- Require server-side permission checks, audit logging and idempotent actions for all sensitive writes.
- Validate rollback plans on the actual devices before enabling firmware or configuration push.
- Never represent hypothetical topology values or admin-submitted samples as real-time service telemetry.
