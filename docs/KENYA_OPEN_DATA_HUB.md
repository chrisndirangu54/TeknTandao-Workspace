# Kenya Open Data Hub — integration guide

## Delivered in this change

- Read-only source registry in functions/src/kenya_open_data_domain.js.
- Authenticated, tenant-checked Firebase v2 callables in functions/src/kenya_open_data.js.
- Workspace Analytics screen: open the installed Analytics module.
- Unit tests in functions/test/kenya_open_data.test.js.
- Supports World Bank Kenya *national* indicators and geoBoundaries gbOpen Kenya ADM1 **metadata**. Time series preserve measurement year and provenance; null periods are dropped. The county boundary endpoint returns a GeoJSON download URL, **not** parcel polygons or census values.
- Caches upstream responses per function instance (1 hour for indicators; 1 day for boundary metadata), with a 9-second upstream timeout and fixed URL allowlist.

This does NOT deploy itself, create live data warehouses, write Firestore records, grant KNBS licensing, implement a cadastral service, or interconnect external Firebase projects.

## Firebase callable contracts

Region: europe-west1. Deployment target: functions:suite.

1. getKenyaOpenDataCatalog({orgId}) -> {sources, datasets}
2. getKenyaOpenDataDataset({orgId,datasetId,fromYear?,toYear?,maxPoints?}) -> normalized observation series or boundary metadata.

Only authenticated members of the specified organization can call either function. They do not expose arbitrary URL fetching. UI uses SuiteStore.call(), which already inserts orgId.

Example (inside Workspace):

    final metadata = await store.call('getKenyaOpenDataCatalog');
    final population = await store.call('getKenyaOpenDataDataset', {
      'datasetId': 'population', 'fromYear': 2015, 'toYear': 2025
    });

Accepted dataset IDs: population, urban_population_pct, gdp_growth_pct,
agriculture_gdp_pct, electricity_access_pct, health_expenditure_pct,
county_boundaries. Nothing is county-specific except the ADM1 boundary metadata.
Year limits: 1960–2100, maxPoints: 1–100.

## Data integrity, rights, and use

| Source | Access | Commercial use |
| --- | --- | --- |
| World Bank Indicators v2 | Real API; no API key | Check the licence attached to the individual dataset and attribute |
| geoBoundaries gbOpen | Real API; no API key | CC BY 4.0, attribution, verify returned metadata |
| KNBS National Statistical Repository | Catalog reference only | Repository defaults to CC BY-NC 4.0; explicit item-level grant needed for commercial use |
| KNBS KeNADA | Catalog reference only | Survey-specific terms, permissions and privacy protections; no raw microdata access |

Sources: https://datahelpdesk.worldbank.org/knowledgebase/articles/889392
https://www.geoboundaries.org/api.html
https://repository.knbs.or.ke/
https://statistics.knbs.or.ke/nada/index.php/home

Do not recast national GDP, electricity or population rates as county or parcel statistics. Never infer ownership, title, transactions, valuation, or land security from a government-statistics API. "Publicly accessible" is not equivalent to "commercially licensed."

## Cross-product integration contract

Use the normalized record shape:
- sourceId, sourceName, sourceUrl, fetchedAt, license, commercialUse
- datasetId, geography, unit
- latest: {year,value} and series: [{year,value}] for national indicators
- boundaryId, boundaryYearRepresented, downloadGeoJsonUrl for ADM1 metadata

Recommended consumers:

| Product | Safe use of initial data | Later work required |
| --- | --- | --- |
| Ardhi Insight | National market background; county map layer metadata | Licensed county-level indicators and validated cadastral interfaces; property transaction evidence |
| TerraForge Labs | Country macro context and administrative context | Geological survey, mining cadastre and remote-sensing source agreements |
| Sokonis | National food-economy and urbanization context | Local market, crop, household and logistics data with geography validation |
| Hulka | National health expenditure trends | Aggregated county health service indicators, suppression/privacy checks |
| Jumuisha AI | Context for cities and national urbanization | City/county metrics from independently licensed and geocoded sources |
| Funzi and school modules | Kenya-wide education context only once curated | Verified curriculum and school-level datasets, child-safety and school permissions |

**Important:** These are consumers planned for the hub, not completed network links. Each stand-alone product currently requires a trusted adapter. A browser in another Firebase project should NOT receive service account credentials or bypass Workspace memberships. Implement an authenticated backend-to-backend federation gateway (scoped service identity, authorization, quotas, audit logs) before connecting separate deployments. Never expose a generic proxy to KNBS or scraping functions.

## Deployment and verification

Run in a checked-out repository with Node 22:

    npm --prefix functions test
    # Flutter UI checks from apps/dashboard:
    flutter analyze
    flutter test

After reviewing the PR, deploy Firebase functions and Flutter client using established release tooling and secrets. Perform live smoke tests with a real authorized Workspace user, and confirm the dataset URLs and per-source licensing at deployment time. No production deployment was attempted in this change.

## Next implementation gates

1. Add independently licensed KNBS county indicators and country/county crosswalks with canonical codes and boundary-version checks.
2. Implement a versioned Postgres/PostGIS ingest store with provenance, checksums, lineage, refresh job metadata, and change alerts.
3. Add an admin data-governance screen for per-dataset license grants and expiry; fail closed on commercial-use checks.
4. Build privacy-safe aggregate analytics and secure external consumer gateway.
5. Add provider-specific contract tests against live APIs in a scheduled CI job (not in every unit test).
