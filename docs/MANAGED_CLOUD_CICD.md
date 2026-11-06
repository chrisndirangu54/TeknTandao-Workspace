# TeknTandao Managed Cloud CI/CD

## Status
Implementation committed on a feature branch. Not deployed or connected to verified client cloud credentials. The GitHub Actions template is a genuinely executable push-to-deploy route once each customer configures a valid, authorised, isolated Google Cloud project. Direct ZIP submissions are quarantined and are NOT executable or automatically deployed.

## GitHub repository deployment
1. Workspace owner visits Cloud Automation > Deploy code from GitHub and registers a repository, branch, Cloud Run service name and region, and budget (a planning alert threshold, not a cloud spending limit).
2. Save the one-time CI ingestion token immediately. In the customer GitHub repository, create secret TEKNTANDAO_INGEST_TOKEN and copy templates/cloud/tekntandao-cloud-run.yml to .github/workflows/tekntandao-cloud-run.yml.
3. Configure GitHub environment production and variables:
   - TEKNTANDAO_ORG_ID: Workspace tenant ID
   - TEKNTANDAO_PROJECT_ID: returned managed deployment ID
   - TEKNTANDAO_INGEST_URL: deployed HTTPS URL of managedCloudCiReport function
   - GCP_WIF_PROVIDER: repository/branch-bound Google Workload Identity Provider
   - GCP_DEPLOY_SERVICE_ACCOUNT: customer-specific deploy identity
   - GCP_CLOUD_RUN_SERVICE: service name
   - GCP_CLOUD_RUN_REGION: supported target region
4. Secure the customer GitHub branch and Cloud Run IAM; enable Cloud Run, Cloud Build and Artifact Registry APIs in the CUSTOMER GCP project; restrict credentials, quotas, egress and budgets. Deployments are private by default. Only explicitly authorise public access after reviewing the app and business need.
5. When a commit reaches the allowed branch, GitHub Actions uses WIF/OIDC to run Cloud Build and deploy the repository source to Cloud Run. The workflow posts the outcome to Workspace with the scoped bearer token. For manual-only projects remove the push trigger and retain workflow_dispatch.
6. Workspace shows self-reported deployments and bounded insights. Optional Gemini narrative uses aggregate numerical metrics only; no source code, credentials or customer logs are provided to the LLM.

Current endpoints:
- cloudRegisterGithubService: owner-only registration and token issuance
- cloudRotateIngestionToken: owner-only credential rotation
- cloudListGithubServices: owner-only project list
- cloudGetGithubServiceInsights: rule-based alerts and CI status
- cloudExplainDeploymentInsights: privacy-scoped optional Gemini analysis and fallback
- managedCloudCiReport: authenticated HTTPS result ingestion, branch/commit validation and idempotency

## Direct source submission
The Flutter screen also supports selecting a ZIP archive up to 10 MiB and submitting it through a 10-minute signed Cloud Storage PUT URL. Finalisation confirms byte count and content type, stores private metadata and marks the archive QUARANTINED. Firebase Storage rules deny generic client access.

Important limitations: the 10 MiB limit is enforced at client and finalisation, not at signed URL transport; use quota controls, expiration and cost alerts. Configure Cloud Storage bucket CORS to allow the trusted Workspace web origin and PUT for browser uploads. ZIP extensions and MIME types are insufficient security checks. Archives must NEVER be built from the Firebase Functions control plane.

Current archive endpoints: cloudCreateArchiveSubmission, cloudFinalizeArchiveSubmission, cloudListArchiveSubmissions.

## Before production release
- Run tests, Flutter analysis and Firestore/App Check emulator tenant-isolation tests.
- Build a dedicated isolated ZIP scanning/build system with ZIP-slip and decompression-bomb checks, malware and dependency scanning, SBOM and build provenance before archive auto-deploy.
- Add a GitHub App / OAuth installer for automated repository onboarding, scoped webhook signatures and repository identity checks.
- Verify deployed service health independently through provider monitoring; currently GitHub reports are SELF-REPORTED, not independently verified.
- Add genuine billing, CPU, memory, latency, error rate telemetry via authorised GCP APIs and enforce budgets at the provider level.
- Implement canary releases, manual rollbacks, logging/alerting, safe tenant-separated worker pools and retention policy.
- Confirm Google Cloud auth/OIDC and Cloud Run APIs, GitHub environment reviewers, bucket CORS and HTTPS callback routing.
- Do not merge or deploy with failing CI.

Official references:
https://github.com/google-github-actions/auth
https://github.com/google-github-actions/deploy-cloudrun
https://cloud.google.com/iam/docs/workload-identity-federation-with-deployment-pipelines

Verification: npm --prefix functions test ; flutter analyze --no-fatal-infos ; flutter test.
