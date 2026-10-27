# Executive Intelligence Agent

## Scope
This read-only executive assistant composes evidence from existing Finance, CRM Sales, Inventory, and HR Operations Agent domain calculations. It is not a separate source of truth.

- `getExecutiveAgentBriefing({orgId,sections:['finance','sales','inventory','hr']})` returns minimized cross-module facts, per-section coverage, generation time and audit run ID.
- `explainExecutiveAgentBriefing({orgId,sections:[...],prompt:'Summarize risks and priorities'})` supplies authorized operational facts to Gemini for an advisory management narrative.

## Permissions and privacy
Only an authenticated workspace owner with access to every selected module can request a briefing. HR needs both HR and Attendance entitlements. The Gemini request contains aggregate attendance/leave counts, operational CRM opportunity IDs and reason codes, stock identifiers and counts, and aggregated finance facts—not raw employee profiles, leave reasons, patient data, customer contact details, or financial provider secrets.

## Fail-closed coverage
Each input collection is bounded at 500 records. Oversized or invalid sections receive an unavailable coverage status rather than fabricated totals. The AI endpoint refuses to synthesize a complete briefing when any selected section is unavailable. Choose a narrower section scope to inspect authorized available reports; this is not a substitute for dataset pagination.

## Interface
Books & Accounting Ledger → Insights (Executive Intelligence Agent). Choose permitted departments, load report evidence and optionally request a Gemini executive briefing.

## Operations
The agent cannot modify records, authorize payments, approve leave, send customer messages, or approve supplier orders. Prompts are analysis requests only. `GEMINI_MODEL` and `GEMINI_API_KEY` must be configured. A deployment and passing CI, Firestore emulator tenancy tests, large-workspace pagination, cost/rate limiting, output retention, and observability checks remain required before production use.
