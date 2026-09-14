# Repository audit

Public repositories inspected: 174. Local clones: 15.

Classification uses repository names and descriptions. Stack checks below read each clone's pubspec; a Firebase messaging dependency alone does not mean Firebase is its database.

| Source | Flutter | Firebase packages | SDK | License file | Integration |
|---|---|---|---|---|---|
| [account-financial-tools](https://github.com/chrisndirangu54/account-financial-tools) | False | None | N/A | LICENSE | Approved domain donor; adapt calculations/workflows |
| [agora-invoicing-community](https://github.com/chrisndirangu54/agora-invoicing-community) | False | None | N/A | LICENSE | Approved invoicing workflow reference |
| [ClientFlow](https://github.com/chrisndirangu54/ClientFlow) | True | firebase_core, firebase_messaging | >=3.3.0 <4.0.0' | Not found; review required | Audit only until licensing resolved |
| [employee-attendance](https://github.com/zwayth/Employee-Attendance-Management-App) | True | None | >=2.19.6 <3.0.0' | LICENSE | Feature donor after Flutter modernization |
| [EWork](https://github.com/chrisndirangu54/EWork) | False | None | N/A | LICENSE | HR workflow reference |
| [firebase-pos](https://github.com/elrizwiraswara/flutter_pos) | True | cloud_firestore, firebase_auth, firebase_core, firebase_core_platform_interface, firebase_crashlytics, firebase_storage, firebase_storage_mocks | ^3.8.1 | LICENSE | Preferred POS feature donor |
| [FlareLine-CRM](https://github.com/chrisndirangu54/FlareLine-CRM) | True | None | >=3.4.1 <4.0.0' | LICENSE | Preferred CRM feature donor |
| [Flutter-Firebase-Inventory-Management-App](https://github.com/chrisndirangu54/Flutter-Firebase-Inventory-Management-App) | True | cloud_firestore, firebase_auth, firebase_core, firebase_storage | >=3.4.3 <4.0.0' | Not found; review required | Audit only until licensing resolved |
| [flutter_hr_management_design](https://github.com/chrisndirangu54/flutter_hr_management_design) | True | None | >=2.12.0 <3.0.0" | LICENSE | HR UI donor after Flutter modernization |
| [Hospital-Management-System-Mobile-App](https://github.com/chrisndirangu54/Hospital-Management-System-Mobile-App) | True | None | >=2.7.0 <3.0.0" | Not found; review required | Audit only until licensing resolved |
| [SchoolMate-App](https://github.com/chrisndirangu54/SchoolMate-App) | True | cloud_firestore, firebase_auth, firebase_messaging, firebase_storage | >=2.16.1 <3.0.0' | Not found; review required | Audit only until licensing resolved |
| [sfdx-dreamhouse](https://github.com/chrisndirangu54/sfdx-dreamhouse) | False | None | N/A | LICENSE | CRM workflow reference |
| [TallyAssist](https://github.com/TallyAssist/TallyAssist) | True | cloud_firestore, firebase_analytics, firebase_auth, firebase_messaging, firebase_storage | >=2.2.2 <3.0.0" | LICENSE | Accounting/POS feature donor after modernization |
| [The-POS-Flutter](https://github.com/chrisndirangu54/The-POS-Flutter) | True | None | >=2.12.0 <3.0.0' | Not found; review required | Audit only until licensing resolved |
| [time-tracking](https://github.com/bizz84/starter_architecture_flutter_firebase) | True | cloud_firestore, firebase_auth, firebase_core, firebase_ui_auth, firebase_ui_firestore | >=3.6.0 <4.0.0" | LICENSE.md | Preferred time/Firebase architecture donor |

## Reuse policy

The suite remains a unified TeknTandao application; donor repositories are not mounted wholesale and do not retain separate authentication, subscriptions or databases. Compatible UI, workflows, calculations and tests are migrated behind the shared TeknTandao module contracts, organization-scoped Firestore paths, RBAC and event bus.

`inventory/module-source-map.json` is the canonical mapping between suite modules and donor repositories. Approved reusable sources are pinned to commits. Missing-license repositories remain reference-only until licensing is resolved. `scripts/sync-module-sources.py` can obtain approved pinned donors without executing their code.

Adjacent commerce, property, collaboration, identity and transport repositories remain candidates and should be audited before a new equivalent module is written from scratch.
