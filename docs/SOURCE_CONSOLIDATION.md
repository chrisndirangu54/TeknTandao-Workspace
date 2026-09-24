# Consolidation and Firebase migration

The supported integration target is `apps/dashboard`: Flutter, Firebase Authentication, organization-scoped Firestore, and callable Cloud Functions. Donor repositories remain references while their workflows are ported. Archiving a donor does not imply feature parity in the dashboard.

## Selected donors

| Area | Retained source | Current migration boundary |
|---|---|---|
| CRM | FlareLine-CRM | Responsive UI donor; its standalone template is not Firebase-backed. Shared CRM lives in the dashboard. |
| POS | firebase-pos | Firebase plus SQLite donor; its original collections/authentication are not yet the suite contract. |
| Inventory | Flutter-Firebase-Inventory-Management-App | Firebase donor; shared inventory already exists in the dashboard. |
| HR | flutter_hr_management_design | UI donor; shared employee records exist in the dashboard. |
| Attendance | employee-attendance | Flutter clock-in uses Firebase Auth and attendance callables. Each member punches only their own day. |
| Time tracking | time-tracking | Distinct billable-hours workflow; donor tenancy migration remains. |
| Hospital | Hospital-Management-System-Mobile-App | PHP client and Stripe calls are replaced by the Firebase patient portal. PDF lab reports and catalogue-priced payments are callable workflows. This is not a full electronic medical record. |
| School | SchoolMate-App | New dashboard lesson, assignment, announcement and grade records use Firebase. Messaging, learning resources, role-specific portals and full workflow parity remain. |
| Accounting | TallyAssist | Flutter/Firebase reference on a legacy SDK; invoice/statement/PDF parity remains. |

## Archived sources

Retired donors live in `source-archive/` as Flutter/Firebase templates. The directory name is the template: `sales-reports`, `invoice-and-customer-store`, `document-reversal-and-netting`, `order-payment-and-product`, and `property-and-favorite`. Each one is a parts shelf of Dart widgets, Firestore records, and callable calls. Upstream PHP, Python, and Salesforce files are not in the template. The full checkout remains a verified ZIP under `source-recovery/`. `inventory/source-consolidation.json` records the upstream name and why it was retired. No GitHub repositories were deleted.

Run `python scripts/consolidate-sources.py` to reproduce the selection. The script refuses to overwrite existing archives. Restoring a donor requires moving its archived checkout back and updating its source-map status.

## New shared record workflows

The hospital and school screens retain their existing directories and add operational record tabs. Writes use `saveModuleRecord`; reads use `organizations/{orgId}/modules/{appId}/records`. The server checks authentication, membership, the app subscription, allowed fields, immutable record kind and same-organization patient/student references. Payment and audit fields cannot be supplied through this endpoint. Existing Firestore rules gate reads by app permission and deny direct client writes.

These are staff record-entry workflows, not a replacement for patient self-service authorization. The patient portal uses the separate hospital callables. Financial status changes for an existing invoice go through Books reversal, credit notes, and netting, or through the hospital payment callables. The donor PHP backend is not compatible with the new endpoint and is not served.

The callable needs deployment with the rest of the Firebase functions before the new screens work against a live project. No deployment or production-data migration was performed.

## Validation

- Backend unit tests passed, including hospital booking, payroll-run, invoice-reversal, and netting checks (53 tests).
- All 10 Firestore rules/integration tests passed against the local emulator, including the new clinical authorization and reference checks.
- The connected-records Flutter widget test passed; the changed Flutter screens and shared store pass analysis.
- Source-map validation, archive-script idempotency and retained source-patch checks passed.

EWork was subsequently restored to `sources/EWork` for AI-assisted workflow gap detection and freelancer matching. See `EWORK_WORKFLOW_COMPLETION.md`; it remains a non-Flutter migration reference.
