# Workspace-specific WhatsApp Business outreach

This is a **proposed library-level integration**, not a deployed UI or a connected Meta API sender. It creates manual click-to-chat links and consent-aware templates; it **never sends messages automatically**.

Each **workspace** must add its own sender. There is no platform-wide default phone, platform-founder attribution, or credential. Tenant sender configuration must be stored under an organization-scoped record such as `organizations/{orgId}/integrations/whatsapp` with the caller's authenticated `orgId` derived server-side. Only workspace **owner/admin** roles may create, replace or disable sender settings. Other members may only receive delegated permissions for business workflows.

## Provisioning
1. Workspace Settings → Integrations → WhatsApp Business → Add number (UI pending). Collect E.164 number, business display name and business portfolio details. Default `verificationStatus=unverified` and `sendingEnabled=false`.
2. Confirm Meta WhatsApp Business Account and Phone Number IDs through an authorized Meta Embedded Signup or supported app coexistence onboarding. Verify ownership before marking the sender verified.
3. Store API secrets separately in a tenant-isolated server-side secret store, never in browser data, GitHub, or another tenant's Firestore record.
4. Enforce owner/admin access, tenant isolation, audit logs, explicit recipient consent, opt-out suppression, approved templates and rate limits. Verify signed webhook callbacks and associate them with the correct organization.
5. Do not enable Cloud API sending without Meta onboarding and a production security review. Manual `wa.me` links do not send messages until the user approves them inside WhatsApp.

`functions/src/whatsapp_outreach.js` provides `validateWorkspaceSender`, `mayConfigureSender`, localized `outreachMessage`, `makeClickToChat`, and `mayAutomateSend` checks. These helpers are not a substitute for Firebase Auth, Firestore rules, server-side RBAC or a Meta API connection.

No personal sender number is embedded in the source, documentation, or templates. Existing numbers in users' private records, if any, would require a separate authorized migration/removal process.
