# Cloud Automation and HTML → Workspace Migration (initial slice)

## Repository boundaries
- Public entry page: `chrisndirangu54/HTML/cloud-automation.html`.
- Workspace importer/validator: `functions/src/cloud_migration_contract.js`.
- HTML is a **planning-only** interface and exports a versioned JSON request. It does not connect to cloud accounts, use LLM APIs or migrate customer data directly.
- Workspace's contract rejects unsupported structures and produces an approval-gated plan; it is not yet wired into a secured API, authenticated upload screen or Firestore persistence.

## Migration pathway
1. Customer creates a plan on the HTML site.
2. Customer explicitly confirms the authorization notice and downloads the migration-request JSON.
3. Customer signs into Workspace at https://tekntandaoworkspace.web.app/.
4. **To implement next:** add an authenticated import UI and server endpoint that verifies the customer belongs to the destination tenant, checks replay protection, sanitizes input, and writes a tenant-scoped `pendingMigration` record with audit logging.
5. A Workspace administrator reviews the record, links the existing customer identity, and imports only approved records. Never trust an HTML-provided tenant ID or user ID.
6. Before any live provisioning, complete Microsoft CSP/customer authorization, Azure RBAC or Lighthouse delegation as applicable, secure secrets, inspect repositories and require deployment approval.

## Implementation backlog
- Tenant-authenticated Workspace Flutter UI and Firebase callable import endpoint
- Customer identity matching and explicit consent; deduplication/rollback/reconciliation
- Azure adapter using narrow service principal permissions, Bicep deployment preview, cost estimation and policy approvals
- Audited CI/CD, Monitor/Defender integration, backup verification, incident workflows
- Firestore security rules, full emulator integration tests and staged production validation

Run the contract unit test with `node --test functions/test/cloud_migration_contract.test.js`.

**No live deployments, customer data migration or cloud billing are enabled by this change.**
