# Microsoft 365, PowerPoint, Power BI and Report Exports

TeknTandao can export Executive Intelligence as real Office/PDF/CSV files and can publish the bounded analytics dataset into Microsoft services.

## Export formats

Executive Intelligence supports:

- PowerPoint `.pptx`
- Excel `.xlsx`
- CSV `.csv`
- PDF `.pdf`
- Word `.docx`

The Office files are generated server-side as OOXML packages. No desktop copy of Microsoft Office is required and no new npm document-generation dependency is introduced.

### Contents

Exports use the same bounded, measured data as Executive Intelligence:

- executive KPI tallies;
- recorded sales trend;
- inventory health;
- support status;
- connector footprint;
- deterministic recommendations;
- method/boundary notes.

Excel contains separate worksheets. CSV is a flattened multi-section dataset. PowerPoint contains presentation-ready KPI, trend, status and recommendation slides. Word and PDF provide report-oriented narrative output.

## Download flow

Workspace members can create a private export from Executive Intelligence.

1. The server rebuilds the bounded Executive Intelligence facts.
2. The requested file is generated in memory.
3. It is written to the private Firebase Storage export area.
4. The caller receives a 15-minute signed read URL.
5. Export metadata is written to `organizations/{orgId}/reportExports`.
6. Download source files are retained for seven days and then purged by `purgeExpiredReportExports`.

A signed download URL is not a permanent public link.

## Microsoft 365 / PowerPoint connection

Microsoft 365 is connected through the existing Automation Studio OAuth flow.

The connection uses Microsoft Graph with:

```text
offline_access
User.Read
Files.ReadWrite
```

Generated PPTX, XLSX, DOCX, PDF and CSV files can be sent to:

```text
OneDrive / TeknTandao Exports/
```

TeknTandao creates the folder if it does not exist.

The Microsoft Graph upload uses the file-content API and is intended for generated reports that remain well below the small-file upload limit.

## Power BI connection

Power BI uses a separate OAuth connection because Microsoft Graph and Power BI APIs use different access-token audiences.

Required delegated scope:

```text
offline_access
https://analysis.windows.net/powerbi/api/Dataset.ReadWrite.All
```

Power BI publishing currently targets a push semantic model in **My workspace**.

If no dataset ID is supplied, TeknTandao creates a push semantic model named:

```text
TeknTandao Executive Intelligence
```

with these tables:

- `KPIs`
- `SalesTrend`
- `Recommendations`

Each publish operation appends timestamped rows. This preserves historical snapshots instead of silently replacing prior reporting data.

If an existing compatible push dataset ID is supplied through the API, TeknTandao appends rows to its expected tables.

### Important Power BI boundary

This integration publishes structured data into the Power BI service. It does **not** generate a proprietary Power BI Desktop `.pbix` project file.

A Power BI user can build dashboards and reports against the resulting semantic model in the Power BI service.

## Entra application configuration

Add a `microsoft` provider to the existing `AUTOMATION_OAUTH_CONFIG` secret.

Example shape:

```json
{
  "google": {
    "clientId": "GOOGLE_CLIENT_ID",
    "clientSecret": "GOOGLE_CLIENT_SECRET"
  },
  "notion": {
    "clientId": "NOTION_CLIENT_ID",
    "clientSecret": "NOTION_CLIENT_SECRET"
  },
  "microsoft": {
    "clientId": "ENTRA_APPLICATION_CLIENT_ID",
    "clientSecret": "ENTRA_APPLICATION_CLIENT_SECRET",
    "tenant": "common"
  }
}
```

The Power BI connection reuses the `microsoft` Entra app configuration unless an explicit `powerbi` configuration is provided.

Register the existing Automation Studio callback URI in the Entra application:

```text
https://europe-west1-tekntandaoworkspace.cloudfunctions.net/automationOAuthCallback
```

Configure the application permissions/scopes required for the connection types you intend to enable. Users still consent separately to Microsoft 365 and Power BI because the access tokens have different audiences.

## Permissions

- Workspace members can create private downloadable report exports.
- Workspace owners are required to use shared Microsoft 365/OneDrive and Power BI connections.
- Provider credentials remain encrypted in the existing Automation Studio secret store.
- Export audit records do not contain raw OAuth tokens.
- OneDrive/Power BI tokens are refreshed server-side when a refresh token is available.

## UI

Open **Executive Analytics → Export / publish**.

Available actions:

- **Download** → choose PowerPoint, Excel, CSV, PDF or Word.
- **OneDrive** → choose a Microsoft 365 connection and output format.
- **Power BI** → choose a Power BI connection and publish a semantic-model snapshot.

Microsoft connections are created under **Automation Studio → Connections**.

## Deployment

The automation deployment script includes:

- `exportExecutiveReport`
- `exportExecutiveReportToOneDrive`
- `publishExecutiveDataToPowerBi`
- `getReportExportHistory`
- `purgeExpiredReportExports`

The same deployment also includes the Microsoft OAuth callback and connection functions already used by Automation Studio.

## Security and reporting boundaries

- Exported sales values are recorded sales, not automatically collected cash.
- Analytics remain bounded by the Executive Intelligence collection limits.
- The generated files contain business data and should be handled according to workspace data policies.
- OneDrive delivery inherits the connected Microsoft user's OneDrive permissions.
- Power BI access and licensing remain governed by the Microsoft tenant and Power BI account.
- Power BI push APIs only work with compatible push semantic models.
- TeknTandao does not claim that publishing rows automatically creates a polished Power BI dashboard; the semantic model is the governed data foundation for those reports.
