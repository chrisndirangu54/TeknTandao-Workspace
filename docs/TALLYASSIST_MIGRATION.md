# TallyAssist current-SDK migration

TallyAssist now targets Dart 3.5+ and uses the workspace's current Flutter SDK. The legacy SDK overrides have been removed from its folder and standalone workspace. Restart the editor's analysis server if it was already running with Dart 2.

The migration retains the accounting screens, ledgers, vouchers, date forms and PDF workflows. Models and widgets use null safety; Firestore uses typed snapshots and current document methods. Provider, Firebase, image selection, PDF rendering, preview and sharing now use supported APIs. Unused legacy dependencies were removed. Firebase initialization precedes authentication, and account streams are created only after sign-in. Registration no longer seeds fabricated balances, stock or vouchers. Logo downloads now write the downloaded bytes instead of leaving an empty file.

The Android project uses Flutter's declarative Gradle plugins and embedding v2, with its existing application ID and release signing settings preserved. An APK/iOS build and live Firebase operations must be validated separately from Dart compilation and widget tests.

## Configuration

Provide `FIREBASE_API_KEY`, `FIREBASE_APP_ID`, `FIREBASE_PROJECT_ID`, and `FIREBASE_MESSAGING_SENDER_ID` through Dart defines. Provide `FIREBASE_STORAGE_BUCKET` for logo storage. Missing or invalid setup displays a setup error. Use your deployment project's native Firebase configuration for messaging; do not reuse the upstream donor's project configuration. No credentials or production deployment are included in this migration.

This is an SDK/API migration. TallyAssist still uses its existing `company/{uid}` and related donor collections. Those are not the suite's organization-scoped accounting schema. Shared tenancy, production rules, legacy record migration and certified eTIMS invoices remain separate work; the retained invoice templates are not eTIMS issuance.

## Validation and recovery

Run `python scripts/check-source-dart.py TallyAssist` from the workspace root. From the donor folder, run `flutter test` and `flutter build bundle`. Tests cover date selection/cancellation, missing khata type validation, signed-out startup, invoice PDF rendering and ledger PDF rendering.

Verified on the installed current SDK: zero analyzer errors, zero warnings (45 informational notices), all six tests passing, and a successful app bundle build. Logs are retained under `inventory/source-diagnostics/TallyAssist.*.log` and the analyzer result in `summary.json`.

Source and Android configuration repairs are exported to `patches/sources/TallyAssist.patch`. The pre-migration checkout is preserved in `source-recovery/TallyAssist-before-dart3.zip` with a SHA-256 companion file.
