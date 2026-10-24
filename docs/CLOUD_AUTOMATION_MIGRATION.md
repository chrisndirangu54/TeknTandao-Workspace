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

## October 24 implementation extension

- `cloudImportMigrationPlan`: signed-in organization-owner submission of an HTML JSON deployment plan.
- `cloudListMigrationPlans`: lists only plans for the authorized workspace.
- `cloudReviewMigrationPlan`: atomically records approval or rejection for a pending plan, but cannot deploy.
- `cloudPreviewPlan`: creates a provider-specific, non-executing target blueprint (Azure/AWS/GCP/private).
- `cloudAssessMonitoring`: assesses explicitly submitted numerical signals, records the observation and flags human-review incidents; it does **not** connect to live telemetry or remediate anything.
- Flutter's `CloudAutomationScreen` can import JSON, list plans, review pending requests and preview a blueprint via `?module=cloud-automation`.
- HTML links to Workspace's module and makes no remote cloud API calls.

### Deployment readiness gate

These commits are a reviewable implementation of the **planning, import and human-review path**, not a completed end-to-end migration of customer data. Before going live:
1. Execute Node tests and Flutter static analysis in a configured build environment.
2. Implement and test customer account linking, identity reconciliation, data import/deduplication and rollback with fixtures; no live customer records are moved yet.
3. Configure per-customer Azure Lighthouse/RBAC delegation and approved Microsoft reseller onboarding.
4. Add real IaC preview/diff and price quoting, and only then an explicitly approved cloud executor.
5. Integrate read-only Azure Monitor telemetry with controlled polling, authentication, retention and anomaly detection.
6. Add dedicated secret management, audited scoped credentials, service quotas, alert thresholds, billing integration and admin rollback.
7. Pass multi-tenant security, emulator, operational and human-approval acceptance tests before hosting deployment.

Current app screens are **not** a deployed service. No cloud resources have been provisioned.

## Executable Azure integration added in feature branch

- `infra/azure/container-app.bicep`: Azure Container Apps, managed environment and Log Analytics template for a pre-approved customer resource group.
- `.github/workflows/azure-customer-deploy.yml`: manually dispatched, OIDC-authenticated `what-if` and deployment. Uses GitHub Environment `azure-production-customer-approval`. Repository administrators must configure required reviewers, protect this environment, and set `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID` before use. Restrict the identity to specific customer-owned resource groups.
- `.github/workflows/azure-approved-maintenance.yml`: approved inspection or restart of an existing container revision.
- `scripts/cloud-ops/monitor.mjs`: read-only Azure Metrics REST reader using a short-lived token, with no automatic remediation.
- `scripts/cloud-ops/incident-agent.mjs`: bounded incident suggestion engine; does not call an LLM or act on infrastructure.
- `scripts/cloud-ops/billing.mjs`: separates verified Azure usage, resale markup and managed-service fees into draft invoices; does not retrieve Microsoft CSP invoices, submit fiscal documents or collect payments.
- Node tests cover bill calculations, incident logic, planning and import contracts.

### Work still requiring integrations, credentials and validation
- **AI model execution**: connect an approved model endpoint with per-tenant redaction, traceability and human review; the present runbook is deterministic.
- **Continuous monitoring**: schedule the read-only monitor with workload identity and per-tenant telemetry isolation; present monitoring is on demand.
- **Customer migration**: plan export/import is implemented; full Firebase identity, account, subscription and data transfer requires verified linkage and a transactional migration/reconciliation tool.
- **Subscription billing**: provider usage synchronization, CSP rate cards, tax compliance, payment provider integration and reconciliation are not yet wired into the draft calculator.
- **Verification**: run `npm --prefix functions test`, `flutter analyze`, `flutter test`, and Azure Bicep `az bicep build --file infra/azure/container-app.bicep` in a connected CI environment; none has been confirmed passing in this session.
- **Never claim a production Azure deployment** before proving tenant delegation, required GitHub environment reviewers and monitoring/rollback procedures.

Manual GitHub workflow invocation is an infrastructure change with cost implications; do not trigger it without the individual customer's express authorization.
