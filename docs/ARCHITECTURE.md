# African Business Operating System — Shared Platform Contracts & Architecture

The **African Business Operating System (BizOS)** provides a multi-tenant, AI-native, modular ecosystem inspired functionally by suites like Zoho, optimized specifically for African SMEs, conglomerates, schools, hospitals, retail networks, and professional services firms.

Central to the platform is the **Jigsaw Puzzle Engine**: business applications exist as interlocking puzzle modules that administrators drag onto their organization workspace. Once provisioned, modules inherit organizational access controls (RBAC), subscribe to platform event streams, and use regional compliance adapters.

## Reuse-first module architecture

TeknTandao follows a feature-donor approach rather than rebuilding every business application from zero. Existing audited repositories may contribute screens, reusable widgets, domain workflows, calculations and tests when licensing and compatibility permit. They do **not** retain their own authentication, tenant database, subscriptions or provider credentials after migration.

The platform remains authoritative for:
- organization tenancy and identity;
- RBAC and module entitlements;
- subscriptions and billing;
- canonical Firestore collections and shared identities;
- payment/tax provider adapters;
- audit history and security boundaries;
- inter-module events and automation;
- AI data-access boundaries;
- Jigsaw module lifecycle.

`inventory/module-source-map.json` records preferred donor repositories and pinned commits. Repositories with unclear licenses are reference-only until rights are resolved. `docs/REUSE_STRATEGY.md` defines the migration process.

---

## Data Fabric Architecture

All Firestore data is strictly isolated under `organizations/{orgId}`.

| Path beneath `organizations/{orgId}` | Purpose | Security & RBAC Boundary |
|---|---|---|
| `members/{uid}` | Member roles & granted app permissions | Member read; owner mutation through server workflows |
| `apps/{appId}` | Active module entitlements & subscription states | Member read; server write |
| `contacts/{id}` | Shared Customer & Lead identity across CRM, POS, Accounting | CRM or POS entitlement |
| `products/{id}` | Canonical SKU product register & stock levels | Inventory or POS entitlement |
| `sales/{id}` | POS retail sales transactions | POS or Accounting entitlement |
| `invoices/{id}` | Sales/accounting invoices & fiscal tax statuses | Accounting entitlement |
| `employees/{id}` | Staff directory records | HR entitlement |
| `projects/{id}` | Project work records | Projects entitlement |
| `tickets/{id}` | Customer support tickets | Helpdesk entitlement |
| `patients/{id}` | Clinical records | Hospital entitlement (restricted) |
| `students/{id}` | School student records | School entitlement |
| `payments/{id}` | Subscription/payment reconciliation records | Owner/finance boundary |
| `modules/{appId}/records/{id}` | Generic module-owned records | Matching app entitlement |

Specialized top-level collections used by dedicated module screens are explicitly mapped to the owning module in Firestore security rules rather than exposed through a broad wildcard.

---

## Core System Services

### 1. Interactive Jigsaw Puzzle Canvas (`JigsawCanvas`)
- Visual drag-and-drop module layout engine in Flutter Web & Desktop.
- Server-side required-dependency provisioning (for example POS requires Inventory).
- Interactive Data Fabric Inspector displaying intended cross-app relationships.

### 2. Universal Command Palette (`CommandPaletteDialog`)
- Keyboard shortcut (`Cmd / Ctrl + K`) opening search and quick action dispatcher.
- Shortcuts: Create Customer, Issue Tax Invoice, Register SKU, Record Sale, Query AI Copilot.

### 3. Global AI Business Copilot (`AiCopilotDrawer`)
- Natural-language query assistant respecting tenant RBAC limits.
- Production reporting sends bounded aggregate commercial facts, not employee/patient narrative data.

### 4. Regional Configuration (`CountryAdapter`)
- UI/configuration metadata can represent Kenya, Nigeria, Ghana and South Africa.
- Listing a country adapter does not imply a certified tax integration exists.
- Kenya eTIMS remains blocked until approved OSCU/VSCU configuration and acceptance tests are complete.

---

## Inter-App Event Bus & Automation

Current production sale workflow:

1. POS sale creation validates stock/customer and writes the sale in a transaction.
2. Inventory stock is reduced atomically.
3. A `sale.created` event is emitted.
4. If Accounting is entitled, a draft invoice is created and a KRA tax-outbox item is marked `blocked_configuration` until certified eTIMS setup exists.
5. If CRM is entitled, a follow-up task is created.
6. Automation run records make replay safe.

Future donor-module migrations should publish/consume documented events through this same platform bus rather than implementing private cross-app databases or direct coupling.
