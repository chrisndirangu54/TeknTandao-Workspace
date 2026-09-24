# Hospital patient portal

Flutter / Firebase replacement for the original PHP client. See the workspace's
`docs/HOSPITAL_FIREBASE_MIGRATION.md` for configuration and server deployment.

Use the current Flutter SDK. The source no longer calls PHP or embeds Stripe
credentials. Authentication uses Firebase Auth; all medical data and billing
operations go through patient-scoped Cloud Functions. Staff manage services and
reports in the shared dashboard's Hospital operations screen.

Original source, assets and platform files were saved in the local
`source-recovery/Hospital-before-firebase.zip`. No legacy patient database was
available for automatic data migration.
