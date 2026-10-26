# CRM Sales Agent

The read-only `getCrmSalesAgentRecommendations` Firebase callable analyses existing organization-scoped CRM opportunities and follow-ups. Pass `{orgId, prompt, limit}` with a signed-in user who has CRM module access.

## Current behavior
The agent checks overdue open follow-ups, opportunities without open follow-up tasks, stages older than 14 days, and expected-close dates already elapsed. Each recommendation includes the opportunity ID, assigned owner, reasons, priority, suggested next action, and a human-review requirement. Results are ordered by priority and monetary amount. Each invocation creates a `crmSalesAgentRuns` audit record containing a count and recommended opportunity IDs. It does not send emails, contact customers, change deal stages, or create tasks.

## Prompt and connector integration
The `prompt` is captured for context and audit, **not yet interpreted by an LLM**. This version uses deterministic policy rules against the native CRM Firestore collections. For prompt-generated cross-app actions, use the existing `draftAgentWorkflowFromPrompt` Automation Studio endpoint, which restricts connected tools and saves disabled drafts requiring owner approval.

## Usage
`getCrmSalesAgentRecommendations({orgId:'workspace-id',prompt:'Which deals are stalled?',limit:25})`

## Boundaries and rollout
The current callable refuses workspaces with more than 500 opportunities or 500 follow-up tasks. This prevents falsely presenting a partial dataset as complete. Before production release, add cursor-based background analysis, role-specific record visibility, throttling and emulator integration tests; review Firestore access rules for CRM agent run records. The repository CI workflow must pass before deployment.
