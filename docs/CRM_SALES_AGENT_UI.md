# CRM Sales Agent dashboard

The CRM module menu now includes **AI Sales Agent**. The Flutter view in `apps/dashboard/lib/modules/crm_sales_agent.dart` calls the existing tenant-scoped backend:

- `getCrmSalesAgentPage`: paginated, deterministic pipeline and follow-up analysis.
- `explainCrmSalesRecommendations`: advisory Gemini explanation on up to 10 selected opportunity IDs, using minimized evidence.
- `createCrmFollowUp`: creates an **internal** follow-up only after a user confirms the displayed task, assigned owner, and due timestamp.

The view does **not** send emails or WhatsApp messages, advance pipeline stages, enroll customers in campaigns, or schedule autonomous outreach. The user must be logged into a workspace with CRM permissions. The AI endpoint requires configured Gemini credentials and a deployed Functions backend.

## Release checks

Build the Flutter dashboard, run analyzer/tests, and verify the three callable endpoints against the Firestore emulator. Confirm that the new menu route renders at desktop/mobile widths, permissions reject unauthorized users, and that a canceled confirmation produces no CRM task. The scheduled autonomous workflow, large follow-up pagination and provider-connected outreach approval are not delivered by this change.
