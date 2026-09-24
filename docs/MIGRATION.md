# Upstream migration work

TeknTandao uses a **reuse-first feature-donor strategy**. Existing repositories should be migrated before equivalent functionality is rebuilt, provided their license, security posture and architecture are acceptable. All approved donors are pinned in `inventory/module-source-map.json` and `inventory/sources-lock.json`.

The audit tooling never executes upstream repository code. Use `python scripts/sync-module-sources.py` to obtain only licensed/pinned donors, and `python scripts/audit-repositories.py` to refresh the broader inventory.

| Area | Sources | Reuse decision and next integration work |
|---|---|---|
| CRM | FlareLine-CRM, ClientFlow, sfdx-dreamhouse | **Prefer FlareLine-CRM** for Flutter CRM UI/pipeline patterns. Replace its data/auth assumptions with `SuiteStore`, canonical contacts and TeknTandao RBAC. ClientFlow requires license review; Dreamhouse is workflow reference only. |
| Inventory | Flutter-Firebase-Inventory-Management-App | Strong Firebase/Flutter donor for inventory flows, but root licensing must be resolved before substantial code copying. Once cleared, map its stock/catalog UX to canonical `products` and server-authoritative stock mutations. |
| POS | elrizwiraswara/flutter_pos, The-POS-Flutter, TallyAssist | **Prefer MIT `flutter_pos`** for product/cart/checkout/receipt UI and Firebase patterns. Keep TeknTandao's server-authoritative sale transaction, idempotent request IDs, M-Pesa/Paystack adapters and shared product/contact data. |
| HR | flutter_hr_management_design, EWork | Reuse the existing HR dashboard/UI after dependency modernization. EWork remains a domain/workflow reference where its stack does not fit Flutter directly. |
| Attendance | employee-attendance | Reuse attendance workflows/UI after modernization, but verify its actual persistence architecture before porting. Do not introduce a second auth or attendance database. |
| Hospital | Hospital-Management-System-Mobile-App | Patient portal, PDF lab reports, and catalogue-priced payments now use Firebase callables. Clinical data stays in organization-scoped records. This is not a full electronic medical record. |
| School | SchoolMate-App | Reuse student/guardian/class UX and Firebase patterns after licensing and Flutter upgrade work. Map all records to tenant-scoped canonical paths. |
| Accounting | account-financial-tools, TallyAssist, agora-invoicing-community | Reuse financial calculations, ledger/reporting concepts, Flutter UI from TallyAssist and invoice lifecycle behavior from Agora. TeknTandao still owns the canonical accounting ledger and payment/tax adapters. |
| Time Tracking | bizz84/starter_architecture_flutter_firebase | **Preferred donor** for Firebase architecture, time-entry flows and tests. Replace per-user ownership with organization/member/project contracts. |
| Property | wallfly, airbnb-clone, cocorico and related property repositories | Audit these candidates before building more property screens. Reuse listing/booking/tenant interaction patterns where licensing and stack allow. |
| eCommerce | Amazon-Clone, ebay-clone, Grocery-Flutter-Design, Multi-Vendor-E-commerce, spree, marketplacekit, vendd | Audit and reuse catalog/cart/merchant UX before writing a new storefront from zero. Shared TeknTandao products, payments and inventory remain authoritative. |
| Transport | Bus-Ticket-app, redbus, GPS4 | Reuse booking, route, fleet or tracking workflows where compatible; integrate them with shared Fleet/Payments rather than shipping separate systems. |
| Collaboration | mini-google-docs-clone, community-edition, instiki, discourse | Audit before implementing WorkDrive/wiki/community functionality from scratch. Prefer reusable collaboration UX and document workflows where licensing permits. |
| Identity/KYC | Identity_Verification, smart-kyc, KYB, KYC-chain, oss-kyc and related repos | Security-sensitive: audit code and licenses carefully. Reuse only isolated, reviewed components; do not inherit authentication or secret-handling blindly. |

## Migration rules

1. **Existing code first:** search the audited portfolio before creating a new equivalent module.
2. **License before copy:** missing or unclear license means audit/reference only.
3. **Port features, not silos:** donor repositories do not keep separate authentication, organization databases, billing or provider credentials.
4. **Canonical data wins:** contacts, products, employees, sales, invoices, payments and shared entities map into TeknTandao's data fabric.
5. **Server-authoritative writes:** sensitive mutations remain behind validated Functions, even if the donor originally wrote directly to Firestore.
6. **Modernize while porting:** remove stale Flutter APIs, dependencies and obsolete SDK constraints rather than freezing the workspace to an old donor version.
7. **Preserve provenance:** retain required copyright/license notices and source commit provenance.
8. **Test the integration:** every migrated feature needs tenant isolation, RBAC, replay/idempotency and cross-module workflow tests as applicable.

## First implementation wave

1. POS from `elrizwiraswara/flutter_pos`.
2. CRM from `chrisndirangu54/FlareLine-CRM`.
3. Time tracking from `bizz84/starter_architecture_flutter_firebase`.
4. HR + Attendance from the existing HR/attendance donors.
5. Accounting/invoicing from TallyAssist, account-financial-tools and Agora.
6. Inventory once redistribution licensing is resolved.
7. School/Hospital once licensing and domain/security requirements are cleared.

The target is not to preserve the donor applications as independent products. The target is to extract proven functionality and make it feel like one simple TeknTandao workspace with one identity, one organization data fabric and consistent cross-app automation.
