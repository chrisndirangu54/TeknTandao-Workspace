# Automation Studio

Open the hub icon labelled **Automation & custom features** on the dashboard,
or use `/?module=automation`. Sign in and choose a workspace first.

Workspace owners can connect services, create workflows, and issue scoped MCP
keys. AI-generated features and JavaScript steps require at least one existing
workspace app with `state: paid` and an unexpired `expiresAt`. Trials do not
unlock customization. There is no new subscription product or price.

## Deployment configuration

The feature is implemented in the existing Firebase Functions codebase and
Flutter dashboard. It requires deployment of both before it is available online.
No credentials are included in the repository.

The project must have billing enabled (Firebase Blaze) for Cloud Functions.
The deployment check on 2026-10-03 found billing disabled and the Cloud Functions
and Secret Manager APIs disabled for `tekntandaoworkspace`. No live release was
made. Enable billing in the Firebase console, then enable the required APIs:

```powershell
gcloud services enable cloudfunctions.googleapis.com secretmanager.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com run.googleapis.com eventarc.googleapis.com pubsub.googleapis.com --project=tekntandaoworkspace
```

After configuring the secrets below and `GEMINI_MODEL` in
`functions/.env.tekntandaoworkspace`, run the metadata-only preflight:

```powershell
./scripts/deploy-automation.ps1
```

Add `-Deploy` to build the production dashboard, deploy the affected automation, reseller and website
functions, and then publish Hosting. A failed build or backend deployment stops
before Hosting. The script checks the Dart configuration's target project and
rejects preview/emulator configurations. It does not link billing accounts,
create credentials, or deploy unrelated functions. See [reseller setup](reseller-platform.md) for the additional registrar/payment secrets.

Configure these Firebase Secret Manager secrets:

- `AUTOMATION_ENCRYPTION_KEY`: a randomly generated 32-byte key, base64 encoded.
  Preserve this key; replacing it without migrating credentials makes existing
  connections unreadable.
- `AUTOMATION_OAUTH_CONFIG`: JSON with the shape below. Use real values only in
  Secret Manager. Both providers are optional in the JSON; an unconfigured
  provider returns an actionable setup error when selected.
- `GEMINI_API_KEY`: the existing Gemini credential used by other AI features.

```json
{
  "google": {"clientId": "GOOGLE_CLIENT_ID", "clientSecret": "GOOGLE_CLIENT_SECRET"},
  "notion": {"clientId": "NOTION_CLIENT_ID", "clientSecret": "NOTION_CLIENT_SECRET"},
  "microsoft": {"clientId": "ENTRA_CLIENT_ID", "clientSecret": "ENTRA_CLIENT_SECRET", "tenant": "common"}
}
```

Set `GEMINI_MODEL` in the Functions environment to a model available to the
configured Gemini project. AI generation does not substitute example content
when the provider is unavailable.

For project `tekntandaoworkspace`, register this exact authorized redirect URI
in both provider OAuth applications:

```text
https://europe-west1-tekntandaoworkspace.cloudfunctions.net/automationOAuthCallback
```

Microsoft setup: register the same callback URI in a Microsoft Entra web application. Microsoft 365 uses delegated `offline_access User.Read Files.ReadWrite`; Power BI uses a separate consent/token audience with `offline_access https://analysis.windows.net/powerbi/api/Dataset.ReadWrite.All`. The Power BI connection reuses the `microsoft` client configuration unless an explicit `powerbi` entry is supplied. See [Office & Power BI exports](OFFICE_POWERBI_EXPORTS.md).

Google setup: create a Web application OAuth client, configure its consent
screen and permitted test users or production publishing, enable Gmail API and the Google Drive, Calendar, Sheets, Docs and Slides APIs, and request these scopes:

```text
https://www.googleapis.com/auth/gmail.readonly
https://www.googleapis.com/auth/gmail.send
https://www.googleapis.com/auth/drive.file
https://www.googleapis.com/auth/calendar.events
https://www.googleapis.com/auth/spreadsheets
https://www.googleapis.com/auth/documents
https://www.googleapis.com/auth/presentations
```

Google may require verification for production use of Gmail scopes. `drive.file`
limits Drive access to files authorized for this application; it is not full
Drive access. This version can create text files and search those available to
the app. It does not include a Google Picker for authorizing pre-existing files.

Notion setup: create a public OAuth connection with read and insert-content
capabilities. During authorization, users choose which pages to share. The
connection can search those pages and create child pages under a shared parent.

Configure secrets with the Firebase CLI (`firebase functions:secrets:set NAME`),
then build with the project's existing Firebase Dart configuration and deploy
Functions plus Hosting using the existing release process. Do not use a preview
build for production. The three secrets above must exist for bound functions to
deploy; `AUTOMATION_OAUTH_CONFIG` may be `{}` until provider setup is complete.

References: [Google web-server OAuth](https://developers.google.com/identity/protocols/oauth2/web-server),
[Notion authorization](https://developers.notion.com/guides/get-started/authorization),
[MCP client transport](https://ts.sdk.modelcontextprotocol.io/client).

## Connections and workflows

Built-in tools:

| Connection | Tools |
| --- | --- |
| Google | `gmail_search`, `gmail_read`, `gmail_send`, `drive_search`, `drive_create_text` |
| Notion | `notion_search`, `notion_create_page` |
| Remote MCP | Tools discovered from the server at connection time |

Remote connections support public HTTPS Streamable HTTP endpoints with optional
bearer authentication. Stdio, legacy SSE-only servers, private network endpoints,
and automatic remote MCP OAuth are not supported. Reconnect to refresh a changed
tool catalog. Tool input schemas appear in the workflow editor.

1. Connect Google, Notion, or a remote MCP server.
2. Create a workflow and add tool steps. Arguments are JSON objects.
3. Use whole-value references such as `"{{input.email}}"`, `"{{input}}"`, or
   `"{{steps.0.id}}"` to pass run input or earlier step output. References preserve
   JSON types. Inline interpolation such as `"Hello {{input.name}}"` is literal;
   use a JavaScript step to construct composed text.
4. Save the draft. Review and enable it explicitly.
5. Run with a JSON input object or select a workspace business-event trigger.

Example: a `gmail_send` step can use:

```json
{
  "to": "{{input.email}}",
  "subject": "Your quotation",
  "body": "{{input.message}}"
}
```

Event triggers observe `organizations/{orgId}/eventBus/{eventId}`. The trigger
must match the event `type`; the event payload becomes workflow input with
`eventType` and `eventId`. Existing code can publish events through the
`publishBusinessEvent` callable. Existing `sale.created`,
`hospital.payment_received`, and `ework.engagement_approved` events from the older
`events` collection also trigger workflows; their scalar fields become input.
Provider
webhooks, Gmail inbox polling, cron schedules, and conditional branches are not
included in this version.

Execution receipts prevent automatic replay of a claimed run. Reusing a run ID
with the same workflow and input returns the existing status. Different input
under the same run ID is rejected. A failed external request may already have
performed its action; these runs become `needs_review` and are not retried
automatically. Failed event preflight checks are recorded as `blocked`. A function terminated before recording failure can remain
`running`; inspect the external provider before issuing a new run ID. Workflow
edits save a disabled draft, and in-flight executions stop before their next
step if the revision changes.

## Premium customization

**Describe a feature** calls Gemini and saves a validated draft comprising a
name, description, typed form fields, and a synchronous JavaScript function body.
The draft preview renders the form and evaluates the code without storing a
submission or executing a connected workflow. Publishing is a separate owner
action. Published features can be opened from Customization; submissions and
results are available in Run history.

**Add custom code** accepts the same JSON contract:

```json
{
  "name": "Quote calculator",
  "description": "Calculate a quote and optionally send it to a workflow.",
  "fields": [
    {"key": "quantity", "label": "Quantity", "type": "number", "required": true},
    {"key": "unitPrice", "label": "Unit price", "type": "number", "required": true}
  ],
  "code": "return { total: input.quantity * input.unitPrice };",
  "workflowId": null
}
```

Supported field types are `text`, `number`, `email`, `date`, and `boolean`.
`workflowId` may refer to an enabled workflow in the same workspace. The form's
code result becomes that workflow's input. Editing a feature returns it to draft.
Customizations are workspace-scoped forms and actions; they do not rewrite or
deploy arbitrary Flutter screens or Cloud Functions.

Code executes in a fresh [QuickJS WebAssembly runtime](https://github.com/justjake/quickjs-emscripten)
with a 16 MiB memory limit, 256 KiB stack limit, and 250 ms execution budget.
`input` and `steps` are JSON values. Return JSON synchronously. There is no
network, filesystem, Node process, package import, or secret access. Use tool
steps or an externally hosted MCP service for integrations needing those
capabilities. Limits also apply on the server, independently of the UI.

## Workspace MCP server

Endpoint:

```text
https://europe-west1-tekntandaoworkspace.cloudfunctions.net/workspaceMcp
```

In **MCP access**, create a key selecting the enabled workflows that a client
may execute. The plaintext key appears once. Send it in an `Authorization:
Bearer ttw_...` header using Streamable HTTP. Keys expire after 30 days and can
be revoked from the studio. The server offers `list_workflows` and
`run_workflow`. A client run must supply `workflowId`, a stable unique `runId`,
and an `input` object. The server never exposes raw provider credentials or
arbitrary Firestore operations.

Clients with a Firebase ID token can instead use that bearer token and append
`?workspace=WORKSPACE_ID`; the server verifies token revocation and owner
membership. MCP keys also recheck current owner membership on every request.
Client software must support custom bearer headers; this version does not
implement OAuth discovery for the workspace MCP server.

## Data and operations

Connection metadata, workflows, features, runs, submissions, and key metadata
are under the existing organization document. They are accessed only through
owner-authorized callable functions. No client Firestore rule expansion is
needed. Secrets use separate, client-inaccessible collections:

- `workspaceAutomationSecrets/{orgId}/connections/{connectionId}`: AES-256-GCM
  ciphertext with authenticated tenant/connection context.
- `workspaceAutomationOAuth/{stateHash}`: single-use, ten-minute OAuth states.
- `workspaceMcpKeys/{tokenHash}`: hashed key lookup and workflow scope.
- `workspaceAutomationUsage/{bucket}` and `workspaceAutomationRefresh/{lock}`:
  quota and token-refresh metadata.

Configure retention appropriate to the deployment for old run results and form
submissions, which may contain business data. OAuth state and quota records
carry `expiresAt` timestamps and can use Firestore TTL. Expired state is rejected
even if TTL deletion has not happened. Do not delete run receipts while their
idempotency keys may still be replayed. Disconnect removes stored credentials;
users can additionally revoke consent in the provider account.

Current per-workspace daily limits: 500 workflow runs, 20 AI generations,
30 MCP connection attempts, 30 OAuth starts, and 2,000 workspace MCP requests.
Workflows have at most ten steps; discovery accepts at most 100 tools over ten
pages. Studio lists are bounded (50 connections, 100 workflows/features, and
30 recent runs/submissions). Event matching processes up to 20 workflows per
event. Payloads and external responses are bounded.

Validation commands:

```text
npm --prefix functions test
firebase emulators:exec --project demo-tandao --only firestore "node --test functions/test/automation_integration.mjs"
cd apps/dashboard
flutter test test/automation_studio_test.dart test/suite_test.dart
flutter analyze lib/modules/automation_studio.dart lib/dashboard.dart
```

Live Google/Notion consent and Gemini generation require the configured
credentials and a deployed callback; local tests use no production accounts.


## Business connectors and Developer API

Google connections also expose Calendar event listing/creation and Sheets range reads/literal appends. Existing Google connections must be reauthorized to grant the new scopes. Sheets appends use RAW values, so user text is not interpreted as formulas.

Slack uses an owner-supplied bot token with `channels:read`, `channels:history` and `chat:write`; invite the bot to the channels it should access. HubSpot uses a private-app token with `crm.objects.contacts.read`, `crm.objects.contacts.write`, and `crm.objects.deals.read`. Tokens are validated using a read-only API call and encrypted in the existing server-only credential store. Provider rate limits and channel/record permissions still apply.

For Stripe, add a remote MCP connection using `https://mcp.stripe.com` and an appropriately restricted Stripe agent API key. Discovery lists the tools actually granted to that key. This is a remote MCP connection, not built-in Stripe OAuth. Other public HTTPS Streamable HTTP business MCPs can be connected with their compatible bearer credentials; OAuth-only MCP servers require their own supported connection flow.

The **Developer** tab exposes both the workspace MCP URL and REST API URL. They share the same expiring, revocable, workflow-scoped bearer keys. Each request rechecks that the key's issuer remains a workspace owner. Both endpoints share a daily 2,000-request workspace quota; workflow execution retains its existing limits and paid checks for code.

```text
GET  https://europe-west1-PROJECT.cloudfunctions.net/workspaceApi/v1/workflows
POST https://europe-west1-PROJECT.cloudfunctions.net/workspaceApi/v1/workflows/WORKFLOW_ID/runs
Authorization: Bearer YOUR_SCOPED_KEY
Content-Type: application/json

{"runId":"unique-request-id","input":{"quantity":2}}
```

GET returns `{workflows: [{id, name, description}]}` restricted to enabled workflows in the key scope. POST returns the workflow receipt/result. Reuse the same `runId` and input for retries. A `needs_review` result must be checked against the external provider before starting a different run; HTTP 200 alone does not mean every external action succeeded. Authentication errors use 401, scope errors 403, quota errors 429, invalid requests 400 and unknown routes 404. Browser CORS is not enabled; this API is intended for server-side integrations. Firebase ID tokens are also supported with `?workspace=WORKSPACE_ID` and current owner membership.

References: [Stripe MCP](https://docs.stripe.com/mcp), [Google Calendar](https://developers.google.com/workspace/calendar/api/v3/reference/events/insert), [Sheets append](https://developers.google.com/workspace/sheets/api/reference/rest/v4/spreadsheets.values/append), [Slack messaging](https://docs.slack.dev/reference/methods/chat.postMessage/), [HubSpot contacts](https://developers.hubspot.com/docs/api-reference/legacy/crm/objects/contacts/create-contact).
