# HR Operations Agent

## Purpose
A read-only HR management assistant that summarizes recorded attendance punches, incomplete checkouts, and leave request statuses. It extends the existing attendance and HR leave collections, without duplicating payroll or leave approval.

## Endpoints
- `getHrOperationsAgentSummary({orgId,month:'2026-10'})`: monthly aggregate attendance/leave counts, bounded exception records, warnings, and audited run ID.
- `explainHrOperationsAgentSummary({orgId,month:'2026-10',prompt:'Which attendance exceptions should we review?'})`: Gemini explanation grounded in aggregate counts and exception-type totals only; individual employee IDs, names, reasons for leave, locations, and health-related notes are excluded from the model prompt.
- Both require an authenticated workspace owner with access to both `hr` and `attendance` modules. Model access requires `GEMINI_API_KEY` and `GEMINI_MODEL`.

## Interface
People & Attendance → HR Operations Agent (sparkle icon). Refresh current-month data and ask for an advisory explanation.

## Boundaries
The agent does not record attendance, approve or deny leave, send employee messages, make disciplinary recommendations, or process payroll. Missing checkouts are exception signals, not evidence of absence or misconduct. Leave records are status counts, not leave entitlement calculations. Counts rely on accurate records; the feature currently refuses more than 500 attendance punches or 500 leave records per snapshot. This is a management review aid, not a statutory or labor-law compliance report.

## Production gates
Run Node tests, Flutter analyzer/build, Firebase emulator tenancy and access tests, then review data-retention/privacy policies and deploy. Add scalable paging, schedules/rosters for absence calculations, and verified CI before production use.
