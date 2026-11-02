# Kenya Open Data — verified service federation (extension of PR #37)

The function kenyaOpenDataFederation provides read-only national World Bank
indicators and geoBoundaries ADM1 metadata to approved *backend services*.
It is a separate onRequest endpoint, **not** a public browser endpoint.
Requests must be POST application/json with datasetId and optional
fromYear, toYear, maxPoints. Client-specific datasets and a fixed
200/day default quota are enforced through Firestore transactions.

## Deploy-time settings

- KENYA_DATA_GATEWAY_AUDIENCE: exact OIDC audience for the HTTP endpoint.
- KENYA_DATA_CLIENTS_JSON: JSON array of fully configured authorized clients.
  Example, replace with actual *dedicated* workload service accounts:

    [
      {"email":"ardhi-service@PROJECT.iam.gserviceaccount.com","app":"ardhi_insight",
       "orgId":"APPROVED_ORG","datasets":["population","urban_population_pct","county_boundaries"],"dailyLimit":200},
      {"email":"terraforge-service@PROJECT.iam.gserviceaccount.com","app":"terraforge_labs",
       "orgId":"APPROVED_ORG","datasets":["population","agriculture_gdp_pct","county_boundaries"],"dailyLimit":200}
    ]

The example identities are illustrative, not real identities or existing
authorizations. Provision service accounts separately, bind invoker IAM
when appropriate, and audit principal and dataset scope. Never use
downloaded service account keys or frontend Firebase config as a service
credential. Set environment variables/secrets in a protected deployment
configuration and verify the generated function URL before granting IAM.
No config -> HTTP 503.

The endpoint validates a Google-signed OIDC identity token with the
correct audience, checks service email and email_verified, matches an
exact allowlisted service principal, restricts dataset ID, and limits
daily calls. OAuth signature/expiry/issuer checks come from
google-auth-library. Requests cannot override source URLs or select an
arbitrary database tenant. No personal, KNBS microdata, or land records
are returned. All response datasets carry provenance and license
fields. Production operations should add gateway alarms and cloud-edge
rate limits in addition to the per-principal daily quota.

## Consumer links

Ardhi Insight: feature/kenya-open-data-federation
TerraForge Labs: feature/kenya-open-data-federation
Both clients use the Google Cloud metadata server to obtain short-lived
OIDC tokens bound to this gateway audience. Fail-closed until explicitly
deployed/configured. Client routes implement their own user/auth checks.
Do not expose the workspace gateway URL as an unrestricted browser proxy.

## Licensing and limitations

World Bank datasets default to CC BY 4.0 with exceptions for certain
third-party indicators: inspect each dataset's terms. geoBoundaries
gbOpen release metadata can be CC BY 4.0 or ODbL; check attribution and
share-alike terms. KNBS repository defaults to CC BY-NC 4.0; it is a
catalog-only source in this version. A separately licensed, manually
approved KNBS aggregate importer and PostGIS schema are staged in the
TerraForge Labs branch; no county indicator data is assumed.

References:
https://www.worldbank.org/ext/en/legal/terms-conditions/datasets
https://www.geoboundaries.org/api.html
https://repository.knbs.or.ke/
https://docs.cloud.google.com/run/docs/authenticating/service-to-service

Review: npm --prefix functions test, and targeted authenticated test on
an authorized service-account backend after deploying the function.
No production deploy or smoke test was completed in this PR.
