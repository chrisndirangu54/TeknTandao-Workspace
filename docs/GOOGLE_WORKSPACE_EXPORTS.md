# Google Workspace Integration and Executive Intelligence Exports

TeknTandao's Google connection now covers Gmail, Drive, Calendar, Sheets, Docs and Slides.

## Automation Studio tools

The Google Workspace connection exposes:

- Gmail search/read/send
- Drive search and file creation
- Calendar list/create event
- Sheets create/read/append
- Docs create/read
- Slides create/read

Write-capable tools remain governed by Automation Studio workflows. Read-only Data Exchange continues to use the explicit read-only tool allowlist.

## OAuth scopes

The Google Workspace OAuth connection requests:

```text
https://www.googleapis.com/auth/gmail.readonly
https://www.googleapis.com/auth/gmail.send
https://www.googleapis.com/auth/drive.file
https://www.googleapis.com/auth/calendar.events
https://www.googleapis.com/auth/spreadsheets
https://www.googleapis.com/auth/documents
https://www.googleapis.com/auth/presentations
```

Enable these APIs in the Google Cloud project:

- Gmail API
- Google Drive API
- Google Calendar API
- Google Sheets API
- Google Docs API
- Google Slides API

Existing Google connections created before Docs/Slides support must reconnect once so the expanded scopes are granted.

## Executive Intelligence publishing

Open **Executive Analytics → Export / publish → Google Workspace**.

Available destinations:

### Google Slides

Creates a native Google Slides presentation containing:

- Executive Intelligence title/summary
- KPI slide
- recorded-sales trend visualization
- inventory health visualization
- support status visualization
- connector footprint visualization
- recommended actions

The presentation is moved into the app-created **TeknTandao Exports** folder in Drive.

### Google Sheets

Creates a native Google Sheets workbook with tabs:

- KPIs
- SalesTrend
- Inventory
- Support
- Connectors
- Recommendations

Values are written as literal/raw values rather than formulas.

### Google Docs

Creates a native Google Docs report with structured sections for:

- KPIs
- sales trend
- inventory health
- support status
- connector footprint
- recommendations
- reporting-boundary notes

### Google Drive file

Generates one of the standard downloadable file formats and uploads it to Google Drive:

- PPTX
- XLSX
- CSV
- PDF
- DOCX

Files are stored under **TeknTandao Exports**.

## Security

- Google Workspace publishing requires workspace-owner access because it uses a shared workspace connector.
- OAuth tokens stay encrypted in the existing Automation Studio credential store.
- Export audit records contain provider file IDs and URLs, never OAuth tokens.
- `drive.file` is used instead of unrestricted Drive access; the app manages files it creates or files explicitly made available to it.
- Native Google files are moved into the app-created export folder after creation.
- Google API operations use the connected user's permissions and remain subject to Google Workspace admin policy and quotas.

## Reporting boundaries

Google Workspace publishing uses the same bounded Executive Intelligence facts as local Microsoft/PDF/CSV exports.

Recorded sales are not automatically equivalent to collected cash. Generated reports do not bypass Data Exchange governance or make external connector data canonical without an approved rule.
