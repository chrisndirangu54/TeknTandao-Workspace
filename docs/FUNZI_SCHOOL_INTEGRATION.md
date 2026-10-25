# Funzi ↔ TeknTandao School: linked-student-only feed (v2)

Funzi may fetch learning materials only after the school owner explicitly links a specific TeknTandao student to a Funzi learner identity. The previous class-only endpoint request is no longer accepted.

1. Deploy the updated Firebase callable functions from `functions/src/platform_entry.js` to `europe-west1`.
2. As workspace owner, call `configureFunziSchoolAccess` to authorize a dedicated Funzi Firebase Auth UID, the allowed classes, and active=true.
3. With school-side authorization and applicable student/guardian consent, call `linkFunziStudent` as owner:
```json
{"orgId":"WORKSPACE_ID","funziLearnerId":"FUNZI_LEARNER_ID","studentId":"TEKNTANDAO_STUDENT_ID","active":true,"linkApproved":true}
```
4. From Funzi's *server* authenticated as the configured Funzi UID, call `funziSchoolFeed`:
```json
{"orgId":"WORKSPACE_ID","funziLearnerId":"FUNZI_LEARNER_ID","type":"assignments","limit":50}
```
Types: lessons, assignments, announcements. The backend resolves the class from the linked student's school record; callers cannot choose a class. Pagination: `nextCursor` / `afterId`. The v2 response includes `funziLearnerId` but no student ID, class roster, marks, attendance, contact information, financial data, or raw free-text notes.

The material is class curriculum relevant to the *linked student*, not uniquely assigned individual learning activities. Add explicit individual-assignment filtering before enabling personalized private assignment records.

To revoke, the owner calls `linkFunziStudent` with the same identifiers and `active:false`. Revoking the integration globally via `configureFunziSchoolAccess` with `active:false` blocks every linked learner.

Security: use a dedicated backend-held Firebase identity, never client-embedded credentials. The service credential is trusted to request content for existing approved learner links; Funzi must enforce that its own logged-in learner corresponds to the requested `funziLearnerId`. No automated imports, background jobs, or production deployment have been verified.
