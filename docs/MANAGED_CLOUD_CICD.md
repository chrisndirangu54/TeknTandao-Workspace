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

## Multi-cloud deployment and prepaid payments (November 2026)

**Supported adapter configurations in this release:** Google Cloud Run, AWS App Runner, Azure Container Apps, DigitalOcean App Platform, Cloudflare Pages, Railway, and Render. This covers seven popular platforms, not literally every cloud service in existence. New providers can be added to the registry and workflow after engineering validation. Provider-specific region values are validated server-side.

### Production payment policy

Customers can pay for TeknTandao's **managed-cloud software subscription** using one of two checkout paths:

1. **Paystack checkout:** start a KES transaction through Paystack's hosted checkout; the customer completes the supported methods on the provider page.
2. **M-Pesa:** request an M-Pesa STK push using Paystack's Kenyan mobile-money charge API (`provider: mpesa`). This is M-Pesa **through Paystack**, not a direct Safaricom Daraja checkout. Customers must approve the payment on their phones. A charge initiation or callback is not proof of settlement.

Both paths use the same server-owned order reference and a dedicated Firebase secret `CLOUD_PAYSTACK_SECRET_KEY`. The server independently verifies transaction status, KES currency, amount in cents, reference, provider transaction ID and paid timestamp before granting any subscription. Provider receipt IDs are globally unique to prevent replay across customers. A `charge.success` webhook is verified with Paystack's HMAC-SHA512 signature, then the transaction is queried again via Paystack's authenticated verification endpoint. Signed webhooks and manual verification use the same reconciliation transaction; duplicate calls do not extend subscriptions twice.

Initial service-plan prices are **provisional, not commercially approved**:

- Starter: KES 1,500 for 30 days.
- Growth: KES 5,000 for 30 days.
- Business: KES 15,000 for 30 days.

Review these prices and any applicable taxes before commercial launch. Unless `CLOUD_BILLING_LIVE_ENABLED=true` is explicitly configured, the checkout code rejects production Paystack keys. Use a `sk_test_` key for test payments. The service fee **does not include AWS/Azure/GCP/other provider usage, domain purchases, storage, traffic or taxes**; customers must be informed of this before paying, and provider spend must be controlled separately. M-Pesa does not support automatic recurring charging under this implementation; payment is renewed explicitly for each 30-day period.

### Paid deployment gate

Use the **new** template at `templates/cloud/tekntandao-multicloud.yml` in the customer repository. Do not use the older Google-only workflow without a paid preflight.

Set GitHub Actions variables `TEKNTANDAO_AUTH_URL` (deployed `managedCloudAuthorizeDeploy` HTTPS function URL), `TEKNTANDAO_INGEST_URL`, `TEKNTANDAO_ORG_ID`, `TEKNTANDAO_PROJECT_ID`, and `CLOUD_PROVIDER`. Store `TEKNTANDAO_INGEST_TOKEN` as a GitHub Actions secret. The workflow sends the project ID, organisation, branch and selected provider to the HTTPS authorisation endpoint before running any provider command. The endpoint checks tenant-scoped project token, project configuration, recorded verified payment and expiration. It returns HTTP 402 when unpaid/expired. A reported successful deployment is also rejected when payment is no longer active.

The preflight checks the **TeknTandao management subscription**, not the provider account's billing status. Cloud execution still requires a separate customer-scoped cloud credential, specific service set-up and protected GitHub environment. A paid subscription alone cannot authorise a remote cloud resource change.

### Provider-specific prerequisites

| Provider | Deployment route | Required provider setup |
|---|---|---|
| Google Cloud Run | GitHub WIF → Cloud Run deploy action | GCP WIF provider, scoped service account, Cloud Build/Run/Registry, service and region |
| AWS App Runner | GitHub AWS OIDC → Docker build and ECR push → App Runner image update | AWS role, account ID, ECR repo, existing image-backed App Runner service ARN |
| Azure Container Apps | GitHub federated Azure login → Container App source deployment | Tenant ID, app registration, subscription, resource group and Container Apps environment |
| DigitalOcean App Platform | doctl create-deployment --update-sources | Existing Git-connected App Platform application, scoped DigitalOcean token and app ID |
| Cloudflare Pages | wrangler Pages upload | Existing Pages project, account ID, scoped API token, Node app building a `dist` folder |
| Railway | railway up --ci | Pre-existing Railway project/service, project-scoped token and applicable service config |
| Render | Secret deploy hook POST | Existing Git-linked Render service and protected deploy hook URL; HTTP success proves trigger acceptance **only**, not deployment completion |

**For every provider:** enforce protected CI environments, least-privilege credentials, tenant separation, repository/branch binding, cost alerts and a post-deployment independent health check. Some routes depend on provider-side Git integration and service initialization; they do not create every type of infrastructure resource automatically. Provider availability and exact CLI/action versions must be validated in an end-to-end customer test before production.

### Payment endpoints

- `cloudStartSubscriptionCheckout({orgId,checkout})` creates a provider checkout with immutable server-side price.
- `cloudVerifySubscriptionCheckout({orgId,reference})` re-queries Paystack and records verified settlement atomically.
- `managedCloudPaystackWebhook` receives HMAC-verified Paystack success events; it re-queries the transaction before activating a subscription.
- `cloudGetSubscriptionStatus({orgId,projectId})` returns the tenant's current paid entitlement and expiry.
- `managedCloudAuthorizeDeploy` is the fail-closed, signed GitHub CI preflight required by the multi-cloud workflow.

### Activation tasks

1. Run the Firebase local emulator tests with two customer organisations, an invalid payment attempt, replayed provider transaction, expired subscription, and mismatched region/provider.
2. Add `CLOUD_PAYSTACK_SECRET_KEY` via `firebase functions:secrets:set CLOUD_PAYSTACK_SECRET_KEY`, configure the deployed Paystack webhook URL, and verify it receives only HMAC-signed production events.
3. Keep `CLOUD_BILLING_LIVE_ENABLED` disabled until rates, terms, tax treatment, refunds/chargebacks, consumer notices and merchant eligibility are approved.
4. Obtain a verified paid settlement from the Paystack test environment before attempting an isolated GitHub Actions deployment to each cloud provider.
5. Confirm billing webhook retry and refund/dispute reversal design; the current implementation **does not** automatically revoke service on refund or chargeback. Add it before production paid service.
6. Independently verify provider resource state, budget, logs and performance rather than treating CI notifications as authoritative. Do not claim 100% deployment automation until onboarding and end-to-end validation are complete.

Official references: https://paystack.com/docs/payments/payment-channels/ ; https://docs.aws.amazon.com/cli/latest/reference/apprunner/update-service.html ; https://docs.digitalocean.com/reference/doctl/reference/apps/create-deployment/ ; https://docs.railway.com/cli/up ; https://render.com/docs/deploy-hooks .


## Unified seven-provider payment enforcement (November 7 update)

All seven supported providers—Google Cloud Run, AWS App Runner, Azure Container Apps, DigitalOcean App Platform, Cloudflare Pages, Railway and Render—share a common backend preflight, `decideManagedCloudDeployment`. Each uses the **same project-specific, independently verified live Paystack billing entitlement**, regardless of whether the customer paid via Paystack hosted checkout or Paystack's M-Pesa channel. The preflight checks that the provider, branch and project match, and that the payment remains active. Test-mode payments, pending charges, expired subscriptions, mismatched providers and unauthorised branches are denied. A dedicated test suite exercises both checkout types and each provider with positive and negative cases.

This is **TeknTandao's service subscription**, not a direct payment to AWS, Azure, Google Cloud or another provider; upstream provider consumption remains separately payable and must be disclosed to customers. No live checkout, production charge, automatic cloud deployment, domain purchase or reseller hosting order is enabled merely by these code changes.
