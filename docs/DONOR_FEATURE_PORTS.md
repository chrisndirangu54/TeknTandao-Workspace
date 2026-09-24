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

SchoolMate, the Supabase attendance app, the time-tracking app, and legacy TallyAssist still keep their own sign-in and storage. Their SDKs or backends do not match `packages/donor_firebase`, so those checkouts were not rewritten in place. Dashboard school and clinical record tabs remain the suite workflows for those domains. Merchant M-Pesa POS checkout and certified KRA eTIMS issuance are unchanged and are not production-enabled.

No upstream code with unclear licensing was copied for the sales report, hospital portal, payroll runs, or invoice reversal. Those are new implementations of the workflow behavior. Donor modifications are exported by `scripts/export-source-fixes.py`, including newly added Dart source and test files. Keep `packages/donor_firebase` alongside `sources` when applying the patches.
