# CRM Sales Agent — paginated and grounded AI analysis

## Endpoints

- `getCrmSalesAgentPage({orgId,pageSize:20,afterId?,limit:25})`: read-only cursor pagination of opportunities (maximum 30 per request) and corresponding follow-ups. Returns `nextCursor` and `hasMore`. The computed flags are rules-based; each page records a summary audit entry.
- `explainCrmSalesRecommendations({orgId,opportunityIds:['id1',...],prompt:'What should we prioritize?'})`: 1–10 selected opportunities. Computes deterministic flags and sends a minimized array of IDs, stages, priorities, amounts, and reasons to Gemini for an advisory explanation. No customer names, emails, phone numbers or full notes are included in the model prompt. Requires `GEMINI_MODEL` and `GEMINI_API_KEY`.

## Review and actions

Both endpoints are read-only. They never create tasks, advance stages, send outreach or move money. Owner-approved prompt-to-tool workflow drafts can be created separately through Automation Studio. That generator is not automatically invoked by CRM Sales Agent.

## Limitations

- Follow-up retrieval per 10 opportunities is capped at 500 documents, and recommendations reject combined snapshots above 500 follow-ups. Large follow-up datasets need dedicated per-opportunity pagination.
- The UI has not yet been extended to call these endpoints.
- Scheduled processing, retry workers, provider/tool actions and approval UX remain future milestones.
- Verify Firestore indexes for the `opportunityId in` query; test Firebase emulator security and tenant boundaries before release.
- Gemini explanations are advisory and may be inaccurate; users must review them before acting.
