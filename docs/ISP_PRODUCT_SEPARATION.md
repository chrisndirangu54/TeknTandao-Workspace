# ISP product separation

TeknTandao ISP and Third-party ISP Management are separate business contexts.

## Third-party ISP Management (`mode: managed`)
Designed for independent internet service providers using TeknTandao Workspace as SaaS. Records are rooted at `organizations/{orgId}/ispManagement/workspace/{subscribers|devices|sites|plans|incidents}/{id}`. Requests require a signed-in member with the ISP app entitlement for that organization; writes require the organization owner or admin. An ISP cannot read or edit another organization's records by changing a subscriber ID or service mode.

## TeknTandao ISP (`mode: operator`)
For TeknTandao's own internet service operations. Records are rooted at `tekntandaoIsp/operations/{subscribers|devices|sites|plans|incidents}/{id}`. Only platform-super-admin tokens may access this mode.

The two modes intentionally have separate Firestore roots, and neither can silently modify the other. The old global `ispSuite` and `ispOperations` records remain a **legacy** super-admin system to avoid destructive migration. Existing records are not automatically migrated.

## New callable interface
`getIspProductModes`, `getIspWorkspaceOverview`, `listIspWorkspaceRecords`, and `saveIspWorkspaceRecord`. The new Flutter screen is `IspProductConsole`, linked from Super Admin with mode selection.

## Current limitations / migration
The new services manage metadata records only. Router provisioning, SNMP/syslog ingestion, RADIUS accounting, prepaid sessions, telecom billing and payment execution remain disconnected. The UI is an administrative entry point, not yet a full replacement for existing ISP workflows. Before release, migrate legacy data explicitly with tenant identification, validate Firestore Rules denying direct client access, test cross-tenant permission boundaries, wire ISP products into non-super-admin workspace navigation, and run Flutter/Functions CI. Existing globally scoped callable endpoints must not be exposed to third-party ISPs.
