# EWork: workflow completion

EWork is retained as a distinct business workflow completion module. Its purpose is to identify unfinished work across installed apps and match qualified freelancers to capability or capacity gaps. This supersedes the earlier instruction to leave EWork archived.

## Intended flow

1. Read authorized organization workflow events: overdue tasks, stalled leads, unresolved tickets, missing deliverables and unassigned work.
2. Detect a gap using explicit workflow rules; AI may explain the gap, suggest required skills and draft a bounded work brief. Each finding links to its source records and distinguishes observed facts from AI suggestions.
3. Suggest an internal assignment, an existing automation or a freelancer depending on the work required.
4. Rank opted-in freelancers by relevant skills, availability, budget, delivery history and business requirements. Show reasons and missing information rather than inventing qualifications.
5. Let the business approve a brief and engagement. Reuse EWork's job, proposal, contract, review and dispute concepts. Do not automatically contact, hire or pay a freelancer merely because a gap was detected.
6. Track milestones and deliverables against the original workflow. Completion requires the business's acceptance; then update the originating task and report the outcome.

## Flutter/Firebase target

Use shared Firebase Authentication, organization membership and app subscriptions. Organization-scoped Firestore records hold workflow gaps, briefs, matches, engagements, milestones and audit events. Freelancer profiles expose only opted-in discovery information. External workers receive access to assigned engagements and explicitly shared material, not general access to the business's CRM, HR or clinical data.

Cloud Functions perform authorization, rule evaluation, AI requests and matching. Event-triggered automation must be idempotent, with source event IDs and explicit gap states (detected, reviewed, assigned, in progress, awaiting acceptance, completed, dismissed). AI-generated briefs and matches remain proposals until reviewed. Payments continue through the platform's existing payment services and verified provider callbacks.

## Current status

`sources/EWork` is the Flutter/Firebase app. Gaps, briefs, freelancer profiles, matches, engagements, and milestones go through `functions/src/ework.js`. Overdue CRM tasks can be scanned into gaps. Matching ranks opted-in members by listed skills and does not call an AI model, hire anyone, or move money. The ASP.NET checkout is preserved in `source-recovery/EWork-before-firebase.zip`.
