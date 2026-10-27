# TeknTandao Finance Agent

Finance Agent is a **read-only advisory assistant** for finance owners. It extends the existing accounting and customer financial integrity domains, not a separate ledger.

## Integration
- Navigation: Accounting → sparkle icon → Finance Agent.
- `getFinanceAgentSummary({orgId})`: returns KES-minor-unit invoice totals, unpaid and overdue balances, up to 50 outstanding invoice rows, and detailed financial integrity exception codes. Writes an audit entry in `financeAgentRuns`.
- `explainFinanceAgentSummary({orgId,prompt})`: uses Gemini with compact evidence only: totals, flags, discrepancy codes, audit status and missing-data warnings. It does not transmit customer names, email addresses, or raw payment-provider details.
- Both callables require authentication, accounting app access and workspace owner role.

## Safety
The model cannot create payments, post journals, approve refunds, send collection notices, write invoices, or close accounting periods. The financial integrity audit checks invoice allocations, settlement balances and expected journals; this is **not** a substitute for external bank/provider statement reconciliation. Invalid invoice balances are excluded and surfaced as warnings. Invoice payment status is not accepted as proof of cash received.

## Known release gates
This version deliberately fails closed when any of invoices, settlements, allocations or journals exceeds 500 records. Large organizations need an incremental and reconciled snapshot mechanism. Due-date fields are recognized as `dueDate` or `dueAt`; missing dates are not treated as overdue. Actual bank settlement, refund evidence, duplicate allocations, closed accounting periods and chargebacks need separate review. Test the Functions with Firebase emulator and the Flutter dashboard; confirm CI and deployment before relying on financial outputs. Gemini requires `GEMINI_MODEL` and `GEMINI_API_KEY` configured.
