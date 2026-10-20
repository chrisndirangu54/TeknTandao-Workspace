# TeknTandao Hybrid ISP Microsite & Operator Console

## Routes

- Public architecture: \`/isp/\` (served from \`apps/dashboard/web/isp/index.html\`)
- Secure operator page: \`/isp/admin.html\`
- Diagram source: \`apps/dashboard/web/isp/architecture.svg\` (editable vector recreation of the planning architecture)

The deployed Firebase Hosting root is \`apps/dashboard/build/web\`, **not** the repository's legacy \`web\` directory. Flutter copies \`apps/dashboard/web/isp/\` into the built web assets during a normal \`flutter build web\`. Host the output using the existing \`firebase.json\` configuration.

## Architecture assumptions

50-subscriber conceptual pilot: 32 GPON customers across two 1:16 splitters and 18 customers in two wireless-fed buildings, each with a managed Ethernet switch and nine CPEs. MikroTik RB5009 is the planned core; VSOL four-port OLT is the proposed fiber termination. COMFAST bridge pairs are proposed for point-to-point building backhaul. The diagram is not evidence of installation or vendor interoperability.

The published COMFAST catalogue confirms the product categories and the CF-E313AC V2 bridge category. It **does not** certify management APIs, telemetry support, sustained link throughput, VLAN passthrough, type approval, or compatibility with selected customer CPEs. Cross-vendor GPON ONT/OLT interoperability also requires lab testing.

The infographic used during ideation is represented here by a responsive, version-controlled SVG so it can be maintained in the HTML codebase.

## Security model

Client-side HTML is **not** a security boundary. Every read/write is a Firebase callable function and re-checks:
1. Firebase authentication.
2. An existing membership of the supplied organization.
3. Membership role \`owner\`, or a validated \`superAdmin\` custom claim for an existing member.
4. Strict input validation and permitted record-state transitions.

The first-time workspace defaults to the account UID (existing \`createOrganization\` behavior). Users with additional workspaces can enter their organization ID. This never grants them authorization without matching backend membership.

ISP state is stored under:
- \`organizations/{orgId}/ispIncidents/{id}\`
- \`organizations/{orgId}/ispWorkOrders/{id}\`
- \`organizations/{orgId}/ispProvisioningRequests/{id}\`
- \`organizations/{orgId}/ispAudit/{id}\`

Client-side Firestore access to these new collections is not required. Admin SDK Cloud Functions are the sole intended read/write surface. Do not add permissive Firestore rules for these paths. State transitions and audit records are written atomically.

## Cloud Functions

- \`getIspAdminOverview\` — most recent 50 manually recorded items per category. Counts are **recent sample counts**, not global aggregates or network statistics.
- \`createIspIncident\` / \`updateIspIncidentStatus\` — manually reported incidents, acknowledgement and resolution.
- \`createIspWorkOrder\` / \`updateIspWorkOrderStatus\` — assign and progress technician work orders.
- \`queueIspProvisioningRequest\` — queue a customer service request for human review.

Exports are registered in \`functions/src/platform_entry.js\` (Firebase Functions \`main\`: \`src/platform_entry.js\`; region: \`europe-west1\`).

## Explicit non-features

- No RouterOS/OLT/SNMP telemetry has been connected by this change.
- No subscriber PPPoE/RADIUS accounts are created or activated.
- No GenieACS provisioning or M-Pesa transaction execution occurs.
- No automated firmware, customer suspension, billing, routing, or network changes occur.
- Operator-entered incidents are labeled manual; no field diagnosis or resolved connectivity is inferred.
- The admin page assumes Firebase Hosting's \`/__/firebase/init.js\` configuration and existing Firebase Authentication providers. Local \`file://\` access does not initialize Firebase.

## Review / rollout

1. Test pure workflow guards using \`cd functions && npm test\` (requires dependencies for the rest of the suite).
2. Build Flutter web: \`cd apps/dashboard && flutter build web\`.
3. Confirm \`build/web/isp/index.html\`, \`admin.html\`, \`isp.css\`, \`architecture.svg\`, and \`admin.js\` are present.
4. Validate hosted routes on Firebase emulator / staging: \`/isp/\` and \`/isp/admin.html\`.
5. Test unauthenticated, non-member, member, owner and platform-superadmin roles against the callable functions.
6. Confirm writes are refused for unauthorized users, validation errors cannot mutate records, and each mutation creates an audit document.
7. Confirm the deployment project has the correct allowed Authentication domains; enable App Check and rate-limit / monitor callables before production launch.
8. Only after authorized staging tests deploy the website and Firebase Functions to the intended project.

Live network adapters should be developed separately with least-privilege service credentials, approval gates, idempotent network operations, dry-run capability, and rollback procedures.
