# Connector & Intelligence Fabric

TeknTandao's Connector & Intelligence Fabric combines Automation Studio, MCP, first-class business API adapters, governed Data Exchange, connector health monitoring and Executive Intelligence.

## First-class connectors

### Slack
Existing bot-token integration:
- list channels
- read channel history
- post messages

### Salesforce
Encrypted API credential:
- Salesforce instance URL
- OAuth access token
- optional API version (otherwise the connector discovers the latest advertised REST version)

Tools:
- list accounts
- list contacts
- list opportunities
- upsert a contact by email

### Atlassian / Jira Cloud
Encrypted API credential:
- Atlassian site URL
- account email
- API token

Tools:
- list accessible projects
- search issues with JQL
- create issues
- add comments

### Zoho CRM
Encrypted API credential:
- Zoho API domain
- OAuth access token

The adapter targets Zoho CRM API V8.

Tools:
- list contacts
- list deals
- upsert contacts by email

### Odoo
Encrypted API credential:
- Odoo base URL
- optional database name
- API key

The adapter uses Odoo 19+ JSON-2 bearer authentication and the `/json/2/<model>/<method>` endpoints rather than the legacy JSON-RPC object service.

Tools:
- list contacts
- list sales orders
- list products
- create contacts

For Odoo deployments older than JSON-2 support, use a remote MCP adapter or a dedicated migration connector rather than downgrading the shared connector security model.

### Remote MCP
Existing remote MCP support remains the universal extension route. Public HTTPS Streamable HTTP MCP servers can expose provider-specific capabilities beyond the built-in adapters. Data Exchange accepts MCP tools only when the MCP tool advertises `annotations.readOnlyHint=true`.

## Connector security

All provider credentials are encrypted at rest using the existing Automation Studio AES-256-GCM credential store. They are never returned to the Flutter client after connection.

User-configurable provider base URLs are protected against:
- non-HTTPS schemes;
- embedded URL credentials;
- non-standard ports;
- localhost/private/link-local literal IPs;
- DNS rebinding to private addresses;
- redirects.

Disconnecting a connection removes the stored encrypted credential.

Each connection has a live health state:
- `healthy`
- `degraded`
- `unchecked`

Workspace owners can run a health probe from Automation Studio. `refreshConnectorHealth` rechecks up to 100 connected integrations every hour.

## Intelligent Data Exchange

Data Exchange moves external records into canonical TeknTandao data under explicit rules.

Current canonical targets:
- CRM contacts
- Inventory products
- Support tickets
- Projects

The generic exchange engine does **not** directly post accounting, payments, payroll, tax, or sales settlement.

### Rule lifecycle

1. Choose a connected provider.
2. Choose a read-only provider tool.
3. Select the TeknTandao target.
4. TeknTandao samples up to five external rows.
5. Gemini proposes:
   - a stable external-ID path;
   - source→target field mappings;
   - basic transforms;
   - warnings.
6. A workspace owner reviews/edits the JSON mapping.
7. The rule is saved disabled.
8. The owner explicitly enables it.
9. Run manually, hourly, or daily.

### Supported transforms

- identity
- string
- lowercase
- uppercase
- number
- integer
- minor_units
- JSON

### Conflict and duplicate handling

Every external row is keyed by connection + source tool + stable external ID.

The engine stores a source hash so unchanged external rows are skipped.

Conflict policies:
- `skip_conflicts` (default): preserve manually edited TeknTandao data and create a review record.
- `tekntandao_wins`: preserve local changes.
- `external_wins`: allow mapped external fields to update the local record.

Sync receipts record:
- rows read
- created
- updated
- skipped
- conflicts
- provider
- rule
- initiator
- timestamps

Scheduled Data Exchange executes only read-only tools. Built-in tools use an explicit allowlist. MCP tools must declare `readOnlyHint=true`. External writes remain in reviewed Automation Studio workflows.

## Outbound automation

Data Exchange is deliberately optimized for external→TeknTandao canonical ingestion.

TeknTandao→external actions use Automation Studio workflows, where write-capable tools already have:
- explicit workflow review/enablement;
- revision checks;
- run receipts;
- idempotent run IDs;
- bounded payloads;
- quotas;
- no automatic replay after ambiguous failures.

This separation prevents a background sync rule from unexpectedly creating tickets, CRM contacts, Slack messages, or other remote side effects.

## Executive Intelligence

The dashboard's former text-only Executive Analytics view is replaced by an interactive intelligence surface.

Current bounded metrics include:
- recorded sales count/value
- six-month recorded-sales trend
- inventory SKU/unit/low-stock/out-of-stock tallies
- CRM contact count
- open/high-priority support tickets
- overdue projects
- installed/paid/trial app counts
- connector counts and live health states
- Data Exchange run counts, created/updated record impact and conflicts
- status distributions
- provider footprint
- simple anomaly flags on the bounded sales series

Charts are implemented with Flutter `CustomPainter` and tap interaction, so no new chart dependency is required.

### Recommendations

Deterministic recommendations are produced first from measured facts, for example:
- replenish constrained stock;
- clear high-priority support backlog;
- recover overdue project work;
- resolve Data Exchange conflicts;
- investigate a large recorded-sales slowdown.

The optional AI executive brief receives only the bounded facts and deterministic recommendations. Its system instruction forbids inventing revenue, profit, cash, forecasts, causes, customers or unmeasured trends.

## Boundaries

- Recorded sales are not equivalent to collected cash.
- Bounded analytics currently read a maximum of 500 records from major operational collections and 100 recent sync runs.
- External provider rate limits, licenses and account permissions still apply.
- Salesforce/Zoho access-token connections require reconnection when the supplied token expires unless the provider credential itself remains valid.
- Odoo external JSON-2 access depends on the Odoo edition/plan and user permissions.
- Jira issue search is eventually consistent; provider read-after-write guarantees remain provider-defined.
- A successful connector health probe means the configured read capability worked at that moment, not that every provider permission is granted.

## Deployment

The existing `scripts/deploy-automation.ps1` now includes:
- enterprise connector callables
- connector health probe/scheduler
- Data Exchange callables/scheduler
- Executive Intelligence callables

No provider credentials belong in Git. Enter them only through Automation Studio or the existing Secret Manager configuration paths.
