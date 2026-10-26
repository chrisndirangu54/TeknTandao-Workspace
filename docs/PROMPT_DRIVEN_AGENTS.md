# Prompt-driven AI agents and workflows

The Workspace Automation Studio can draft tenant-scoped workflows from natural language.

## Callable endpoint
`draftAgentWorkflowFromPrompt({orgId, prompt})` requires an authenticated workspace owner and an active paid subscription. The backend uses configured `GEMINI_MODEL` and secret `GEMINI_API_KEY` to generate a workflow using **only the current workspace's connected tool IDs and tool names**.

The generated plan is validated using the existing `workflowSchema` and `validateWorkflowConnections`, then saved to `organizations/{orgId}/toolWorkflows/{id}` with `enabled:false`, `trigger:'manual'`, and `approvedBy:null`. AI-generated JavaScript/code steps are rejected. Draft creation is quota-limited. The API response returns a draft ID and the validated workflow.

## Approvals and execution
Owners review the generated steps and parameters in Automation Studio. Use the existing `saveToolWorkflow` approval and `executeWorkflow` path; drafting **does not invoke external tools**. High-impact operations should require separate review of arguments, connected-account scopes, and audit logs before enabling. A generated prompt is never authorization to send messages, alter records, make payments, or change permissions.

## Example objective
"Each weekday, review the connected CRM's overdue follow-ups and prepare a summary for me. Do not contact customers without approval."

## Deployment and limitations
Requires an existing connected automation tool, Gemini configuration, and Firebase Functions deployment. No autonomous multi-agent collaboration loop or scheduler is added by this endpoint; it provides the safe planning and approval foundation. Integration tests with configured Gemini and connected providers remain necessary.
