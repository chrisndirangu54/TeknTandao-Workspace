# African Business Operating System — Shared Platform Contracts & Architecture

The **African Business Operating System (BizOS)** provides a multi-tenant, AI-native, modular ecosystem inspired functionally by suites like Zoho, optimized specifically for African SMEs, conglomerates, schools, hospitals, retail networks, and professional services firms.

Central to the platform is the **Jigsaw Puzzle Engine**: business applications exist as interlocking puzzle modules that administrators drag onto their organization workspace. Once provisioned, modules auto-discover shared data fabrics, inherit organizational access controls (RBAC), subscribe to platform event streams, and configure regional tax compliance rules (e.g. KRA eTIMS).

---

## Data Fabric Architecture

All Firestore data is strictly isolated under `organizations/{orgId}`.

| Path beneath `organizations/{orgId}` | Purpose | Security & RBAC Boundary |
|---|---|---|
| `members/{uid}` | Member roles & granted app permissions | Member read; owner mutation |
| `apps/{appId}` | Active module entitlements & subscription states | Member read; server write |
| `contacts/{id}` | Shared Customer & Lead identity across CRM, POS, Accounting | CRM, POS, or Accounting entitlement |
| `products/{id}` | Canonical SKU product register & stock levels | Inventory or POS entitlement |
| `sales/{id}` | POS retail sales transactions | POS or Accounting entitlement |
| `invoices/{id}` | Double-entry invoices & fiscal tax statuses | Accounting or POS entitlement |
| `employees/{id}` | Staff directory & clock-in attendance records | HR entitlement |
| `projects/{id}` | Project milestones, budgets & task deliverables | Projects entitlement |
| `tickets/{id}` | Customer support tickets & SLA tracking | Helpdesk entitlement |
| `patients/{id}` | Hospital clinical records & patient directory | Hospital entitlement (Restricted) |
| `students/{id}` | School student roster, guardians & fee balances | School entitlement |
| `etims_logs/{id}` | KRA eTIMS tax fiscalization audit trail | Compliance / Accounting entitlement |
| `payments/{id}` | M-Pesa STK Push & Paystack transaction logs | Finance entitlement |

---

## Core System Services

### 1. Interactive Jigsaw Puzzle Canvas (`JigsawCanvas`)
- Visual drag-and-drop module layout engine in Flutter Web & Desktop.
- Automatic dependency solver (e.g., POS automatically requires Inventory & Accounting).
- Interactive Data Fabric Inspector displaying exact event routing rules.

### 2. Universal Command Palette (`CommandPaletteDialog`)
- Keyboard shortcut (`Cmd / Ctrl + K`) opening search and quick action dispatcher.
- Shortcuts: Create Customer, Issue Tax Invoice, Register SKU, Record Sale, Query AI Copilot.

### 3. Global AI Business Copilot (`AiCopilotDrawer`)
- Natural language query assistant respecting tenant RBAC limits.
- Executive analytics for cash flow, stock risk alerts, revenue performance, and tax compliance.

### 4. Pluggable Regional Tax Adapters (`CountryAdapter`)
- Pluggable country adapters: Kenya (`KE` eTIMS 16%), Nigeria (`NG` FIRS 7.5%), Ghana (`GH` GRA 15%), South Africa (`ZA` SARS 15%).

---

## Inter-App Event Bus & Automation

1. **POS Sale Processed**: `sale.completed` $\rightarrow$ Stock deducted in Inventory $\rightarrow$ Invoice draft created in Accounting $\rightarrow$ Transaction submitted to KRA eTIMS $\rightarrow$ Payment receipt logged in Payments Hub $\rightarrow$ CRM follow-up task queued.
2. **Deal Won in CRM**: `deal.won` $\rightarrow$ Customer record created in Accounting $\rightarrow$ Invoicing quote generated.
3. **M-Pesa Payment Received**: `payment.reconciled` $\rightarrow$ Invoice marked Paid $\rightarrow$ Stock reserved for delivery.
