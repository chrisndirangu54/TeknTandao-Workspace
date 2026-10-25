# Enterprise resilience and disaster recovery acceptance checklist

This checklist is an operational prerequisite, **not evidence that a restore or security audit has passed**.

## Security release gates
- Verify Firebase rules in the emulator against both member and cross-tenant reads/writes for every sensitive collection, including patient notes, payroll, school grades, and documents.
- Ensure privileged Cloud Functions authorize the caller's organization and app entitlement server-side.
- Require fresh authentication and an independent approval trail for destructive, clinical, payroll, tax and financial operations.
- Confirm agent actions fail closed when policy confirmation or evidence is absent.
- Rotate provider credentials and verify no secrets are committed, logged or returned to the client.

## Backups and restoration
1. Configure automated Firestore exports to an access-restricted, versioned Cloud Storage destination in an appropriate region. Keep export-admin and restore-admin roles separate.
2. Back up Firebase Storage objects, Cloud Functions configuration (excluding secrets), deployment manifests, versioned rules and required encryption-key references.
3. Record export manifest, object counts, checksum strategy, encryption, retention and recovery point. Never put provider secrets in export artifacts.
4. Restore to an **isolated test Firebase project**, never the production project during a drill.
5. Verify record counts and referential integrity across tenants, compare invoice-journal totals, replay idempotency checks, and confirm representative user permissions still work.
6. Document recovery time (RTO), restore-point age (RPO), failure conditions and responsible approver; repeat after major data-model changes.

## Operational failure exercises
- Simulate payment provider timeouts, duplicate callback delivery and mismatched payment evidence.
- Test stock transfers and receipt retries under concurrent execution.
- Verify queued automations cannot run without an authorized principal, approval and policy evidence.
- Check audit-log completeness, alert routing, tenant data deletion and offboarding.

## Release sign-off
Do not describe the platform as enterprise-ready until the CI suite passes, live authorization is reviewed, restore drill evidence is recorded, and the deployment configuration is validated in the target environment.
