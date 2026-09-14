# Reuse-first module strategy

TeknTandao should not rebuild business software that already exists in the audited repository portfolio unless there is a clear architectural, licensing, security or product reason to do so.

The platform therefore uses a **feature-donor model**:

1. **TeknTandao owns the platform contracts.** Authentication, organization tenancy, RBAC, subscriptions, billing, Firestore paths, event contracts, audit logging, AI boundaries and country adapters remain native to TeknTandao.
2. **Existing repositories donate product features.** Screens, interaction patterns, validated business workflows, calculations, reusable widgets and test cases should be migrated from compatible repositories into a TeknTandao module rather than recreated from zero.
3. **Whole legacy apps are not mounted directly.** A donor app may carry an incompatible Flutter SDK, its own authentication, an independent Firebase schema, stale dependencies or assumptions that violate the shared data fabric. Reuse happens behind the common `SuiteStore`/module contract.
4. **Licensing is a hard gate.** MIT/BSD/Apache-compatible donors can be adapted with required notices. Repositories with missing or uncertain licensing are audit/reference-only until rights are resolved.
5. **Pinned provenance is mandatory.** Every migrated feature must identify the source repository and source commit in `inventory/module-source-map.json`, and the upstream license/copyright notice must be retained when required.

## First reuse wave

| TeknTandao module | Existing repository | Reuse target | Decision |
|---|---|---|---|
| CRM | `chrisndirangu54/FlareLine-CRM` | Lead/contact/pipeline UI and interaction patterns | Preferred donor; MIT |
| POS | `elrizwiraswara/flutter_pos` | Cart, product, checkout and receipt flows | Preferred donor; MIT |
| Time tracking | `bizz84/starter_architecture_flutter_firebase` | Firebase architecture, time entry flows and tests | Preferred donor; permissive license |
| HR | `chrisndirangu54/flutter_hr_management_design` | HR dashboard and employee UX | Reuse after Flutter dependency modernization |
| Attendance | `zwayth/Employee-Attendance-Management-App` | Attendance workflows | Reuse after Flutter dependency modernization |
| Accounting | `chrisndirangu54/account-financial-tools` + `TallyAssist/TallyAssist` | Calculations, bookkeeping/reporting workflows and Flutter UI | Adapt into native accounting data contract |
| Invoicing | `chrisndirangu54/agora-invoicing-community` | Invoice lifecycle and document workflow | Reference/port domain behavior; non-Flutter |
| Inventory | `chrisndirangu54/Flutter-Firebase-Inventory-Management-App` | Stock and warehouse workflows | License review before substantial copying |
| Hospital | `chrisndirangu54/Hospital-Management-System-Mobile-App` | Clinical navigation and patient workflows | License review before substantial copying |
| School | `chrisndirangu54/SchoolMate-App` | Student/guardian/school flows | License review before substantial copying |

## Migration pattern

For each donor module:

1. Pin and audit the donor commit.
2. Record the license and attribution requirement.
3. Inventory reusable screens, widgets, domain models and tests.
4. Remove donor authentication/database ownership from migrated code.
5. Replace donor persistence with the TeknTandao `SuiteStore` and canonical organization-scoped paths.
6. Replace donor roles with TeknTandao RBAC and module entitlements.
7. Replace direct payment/tax calls with TeknTandao provider adapters.
8. Connect the module to shared contacts, products, employees, invoices, payments and events instead of duplicating those entities.
9. Modernize Flutter/Dart APIs and dependencies where required.
10. Add integration tests proving tenant isolation and inter-module workflows.

## What should remain native

Some capabilities are better implemented once in the platform and reused by every donor app rather than copied from upstream repositories: organization tenancy, authentication, role/permission enforcement, subscription billing, M-Pesa/Paystack provider verification, KRA eTIMS adapters, audit logs, AI Copilot boundaries, workflow/event bus, command palette, shared search, notifications and the Jigsaw workspace engine.

## Expansion rule

Before creating a new module from scratch, check `inventory/repository-classification.json` and `inventory/module-source-map.json`. If an existing repository covers at least a meaningful part of the required workflow, migrate that functionality first. Create new native code only for missing functionality, incompatible architecture, unresolved licensing, unacceptable security risk or a materially better platform-specific design.
