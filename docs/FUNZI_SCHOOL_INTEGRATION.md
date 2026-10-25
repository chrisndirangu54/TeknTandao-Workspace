# Funzi ↔ TeknTandao School Management read-only integration

## Setup

1. Deploy the two Cloud Functions exported by `functions/src/platform_entry.js` in `europe-west1`.
2. Provision a dedicated Firebase Auth identity for Funzi's backend, preferably via your IAM-managed service infrastructure. Protect its credentials and rotate them; do not embed them in a mobile or web client.
3. Sign in as the workspace **owner** (with an active school subscription) and call `configureFunziSchoolAccess` with:
   ```json
   {"orgId":"WORKSPACE_ID","funziUid":"FUNZI_FIREBASE_UID","classNames":["Form 1"],"active":true}
   ```
4. From Funzi's authenticated backend, call `funziSchoolFeed` with:
   ```json
   {"orgId":"WORKSPACE_ID","type":"assignments","className":"Form 1","limit":50}
   ```
5. For more records, pass the returned `nextCursor` as `afterId`. Null means the page is exhausted. Types: `lessons`, `assignments`, `announcements`.

Calls use **Firebase callable functions** authentication (Firebase ID token); this is not an unauthenticated REST endpoint. You may call callable functions through the Firebase SDK or implement the HTTPS callable request envelope correctly on Funzi's server.

## Security contract

- No student identities, grades, attendance, contacts, billing, or medical records are returned.
- Only owner-approved class names and curriculum types are readable.
- Revocation: owner calls `configureFunziSchoolAccess` with the same Funzi UID and `active:false`.
- The feed is read-only; no writes to school records are performed.
- Existing school subscription is checked on every request.
- Data is read live at request time, subject to pagination; it is **not** automatically pushed or synchronized into Funzi's database.
- Composite Firestore indexes may be required for kind/className/ID queries. Validate them in the emulator or deployment logs.
- Use normal organizational governance and obtain school authorization before enabling access; records may contain sensitive information in free-text notes, which should be reviewed before sharing.

## Next milestones

Add Funzi-side scheduled pulls/webhook ingestion with idempotent cursors, selective field mapping and observability; support roster/grades only under a separate consented and identity-scoped contract. 
