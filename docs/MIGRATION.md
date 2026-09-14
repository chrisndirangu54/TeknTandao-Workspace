# Upstream migration work

All clones are pinned in `inventory/sources-lock.json`. The audit generator reads source manifests without running upstream code. Run `python scripts/audit-repositories.py` to regenerate the inventory.

| Area | Sources | Findings and next integration work |
|---|---|---|
| CRM | ClientFlow, FlareLine-CRM | ClientFlow uses MySQL/SQLite with Firebase messaging; FlareLine is a dashboard. Replace repositories and auth with suite contracts, migrate customer IDs, check root/dependency licenses. |
| Inventory | Flutter-Firebase-Inventory-Management-App | Uses Auth/Firestore, but independent paths and identity flow. Map products to tenant products, route stock mutations through backend transactions, resolve redistribution licensing. |
| POS | The-POS-Flutter, firebase-pos | Existing fork targets Dart 2 and uses HTTP/Hive. New MIT candidate uses Flutter/Auth/Firestore plus local storage. Adapt catalog/customer repositories and server-authoritative checkout; preserve offline replay IDs. |
| HR | flutter_hr_management_design, EWork | HR fork is a Dart 2 UI; EWork is a different stack. Build real employee, leave, attendance and payroll domain workflows before integrating screens. |
| Hospital | Hospital-Management-System-Mobile-App | Dart 2 HTTP client, no Firebase database dependency. Clinical records, scheduling, pharmacy and billing need separate domain schemas and granular clinical roles. No migration of patient data has been attempted. |
| School | SchoolMate-App | Firebase dependencies but Dart 2 constraints. Port roles, pupils, classes and fee workflows with tenant boundaries. |
| Books | TallyAssist, account-financial-tools, agora-invoicing-community | TallyAssist is a legacy Flutter/Firebase candidate; Odoo and PHP sources are reference systems, not Flutter modules. Current Books is draft invoices only, not double-entry accounting. |
| Time | time-tracking | Modern Flutter/Firebase MIT candidate; uses per-user jobs/entries. Replace per-user ownership with organization/job/member contracts and shared auth. |
| Attendance | employee-attendance | README advertises Firebase but checked pubspec has no Firebase packages; treat as an unverified candidate, not a ready integration. |
| Property CRM | sfdx-dreamhouse | Salesforce/Apex source; reference only for a future Flutter implementation. |

Priority: integrate the modern Firebase POS and time-tracking data layers, complete CRM/inventory editing and import tooling, then HR/school/hospital domain workflows. Preserve upstream copyright notices for reused code; missing root licenses and commercial dependencies need review before shipping their code.

The initial suite demonstrates the integration contract with new code. It does not claim these cloned applications are already migrated, compiled or production ready.
