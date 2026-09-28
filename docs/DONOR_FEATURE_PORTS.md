# Retained donor feature ports

EWork is retained for workflow gap detection and freelancer matching, following the user's revised direction. See `docs/EWORK_WORKFLOW_COMPLETION.md`. Its original backend still requires Flutter/Firebase migration.

## Implemented

- `firebase-pos`: Sales insights, inspired by ClientFlow's sales/customer reports, implemented against the retained donor's own transaction repository. The Transactions toolbar opens product rankings, customer spending and payment-method totals. It reads all locally available pages, deduplicates transaction IDs, uses product IDs across renames, preserves recorded sale amounts rather than cash tendered, and discloses missing line details. It does not call ClientFlow's PHP services or claim predictive AI.
- `FlareLine-CRM`: The routed contacts screen now signs in with Firebase Auth, reads organization contacts from Firestore and creates customers/leads through the suite's `saveRecord` callable. Upstream sample contact UI remains an unrouted layout reference.
- `flutter_hr_management_design`: The dashboard's main data panel now displays real organization employees and allows creation through the same callable, replacing the sample recruitment table in that location. Other template widgets remain illustrative.
- `packages/donor_firebase`: Shared Firebase setup, authentication, organization-scoped record panels and server-checked writes for the two donors. It reuses existing suite permissions and subscriptions rather than introducing separate write rules.

## Configuration

Run each donor with Dart defines for `FIREBASE_API_KEY`, `FIREBASE_APP_ID`, `FIREBASE_PROJECT_ID`, `FIREBASE_MESSAGING_SENDER_ID`, and `TANDAO_ORG_ID`. Use registered Firebase apps in the same project as the deployed suite functions. Sign in with an existing organization member whose CRM/HR access is active. Organization creation and membership provisioning remain in the main dashboard. Missing configuration is shown as a setup error rather than silently selecting a donor's original Firebase project.

## Ported workflows

- Hospital patient operations no longer use PHP or Stripe. Appointments, lab tests, prescriptions, history, catalogue-priced Paystack/M-Pesa bills, and PDF lab reports go through the callable API in `functions/src/hospital_portal.js`. Staff service, booking, and report upload live in the dashboard Hospital operations screen. See `docs/HOSPITAL_FIREBASE_MIGRATION.md`.
- CRM deals, tasks, calendar events, and the pipeline report read and write organization records. The report is a read-only total of stored deal values, not collected revenue.
- HR employees, recruitment applications, and leave requests use the same callable records. Payroll runs record an employee, period, gross amount, and status only. They do not calculate PAYE, NSSF, SHA, or the housing levy.
- Books can reverse an unpaid invoice, issue a credit note for an existing customer or patient, and net one open receivable against one open credit for that same party. The behavior is implemented in `functions/src/accounting_domain.js`. Archived Odoo and Agora sources were compared and were not copied.

## Still separate

SchoolMate and TallyAssist still require a separate tenancy review. Attendance now uses the shared Firebase backend. Time tracking now stores jobs and entries under `organizations/{orgId}/timeMembers/{uid}` and uses the `mutateTimeRecord` callable for writes. Dashboard school and clinical record tabs remain the suite workflows for those domains. Merchant M-Pesa POS checkout and certified KRA eTIMS issuance are unchanged and are not production-enabled.

No upstream code with unclear licensing was copied for the sales report, hospital portal, payroll runs, or invoice reversal. Those are new implementations of the workflow behavior. Donor modifications are exported by `scripts/export-source-fixes.py`, including newly added Dart source and test files. Keep `packages/donor_firebase` alongside `sources` when applying the patches.


## CRM authentication and time tracking follow-up

CRM entry screens now authenticate through Firebase instead of a hard-coded demo password. Signup validates password confirmation, password reset uses Firebase, social buttons use configured Firebase providers, and toolbar logout clears the Firebase session. Signing up does not grant organization membership. Social providers must be enabled in the Firebase project.

Time tracking requires `TANDAO_ORG_ID` and an active Time subscription for the signed-in organization member. Client reads are limited to that member's jobs and entries. Server writes validate rates, job ownership and time ranges, and atomically delete up to 400 associated entries when deleting a job. Larger jobs require removing entries first. Rates preserve the donor's original whole-currency-unit convention; existing user-path data is not automatically copied. The older Firebase UI dependency requires Cloud Functions client 5.3.4 in this donor.

Validated CRM auth paths with three focused tests; Firestore rules and integration checks cover tenant/member separation and server-only time mutations. Deploy the new callable and rules before using the updated time donor against a live project.
