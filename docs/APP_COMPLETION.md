# Application Completion Model

TeknTandao Workspace completes the master catalogue in two layers so hundreds of apps can be operational without creating hundreds of disconnected codebases.

## Layer 1 — Operational runtime for every catalogue app

Every installable app inherits the shared platform runtime:

- tenant-isolated Firebase data,
- RBAC and subscription entitlement checks,
- independent KES pricing,
- searchable/category-filtered discovery,
- domain-specific record schemas,
- create and edit workflows,
- status pipelines and workflow progression,
- close/archive behavior,
- live record counters,
- shared AI/reporting and future event-bus integration points.

The 30 catalogue families have tailored blueprints. Examples include Mining site/material/location records, Healthcare patient/provider/service records, Finance counterparty/ledger/amount records, Transport vehicle/origin/destination records, NGO programme/donor/beneficiary records and AI-agent goal/data-scope/guardrail records.

## Layer 2 — Deep specialist implementations

Apps that need specialized calculations, regulated integrations, devices or large domain workflows graduate from the shared runtime into dedicated module screens and backend services. Existing repositories are reused as donors where licensing, security and compatibility allow.

Examples already receiving dedicated implementations include CRM, POS, Inventory, Accounting, HR, Projects, Helpdesk, Hospital, School, Property, SACCO, eTIMS, Payments, Marketing, Bookings, E-Commerce, Procurement, Manufacturing, Field Service, Fleet, Hotel, Restaurant, NGO and Documents.

## Production boundary

An operational catalogue app is a real tenant-scoped workflow application, but it is not automatically equivalent to a mature specialist product. Regulated or provider-dependent features remain gated until the real integration exists. In particular, KRA eTIMS fiscal issuance requires certified OSCU/VSCU configuration and merchant M-Pesa checkout requires the production reconciliation/refund/dispute flow.

Password/secret-management products must not be marketed for real credential storage until an audited encryption/key-management implementation is added.
