# African Business Operating System (BizOS)

A production-grade, multi-tenant, modular business operating system built for African SMEs, enterprises, schools, hospitals, retailers, and professional services firms — designed as an AI-native alternative to Zoho.

---

## 🌟 Key Capabilities

### 🧩 1. Jigsaw Puzzle Workspace Engine (`JigsawCanvas`)
- Administrators manage their company workspace by dragging visual puzzle pieces onto an active canvas.
- Dropping a module provisions its backend rules, subscribes to system events, and visualizes connected data flows (`POS ↔ Inventory ↔ Accounting ↔ KRA eTIMS`).
- **Interactive Data Fabric Inspector**: Click connection badges to inspect cross-app data routing rules.

### ⌨️ 2. Universal Command Palette (`Cmd/Ctrl + K`)
- Instant search and action dispatcher (`CommandPaletteDialog`).
- Quick actions: Create Customer, Issue Tax Invoice, Register Product SKU, Record POS Sale, Query AI Copilot.

### 🤖 3. AI Business Copilot (`AiCopilotDrawer`)
- Global AI assistant with tenant RBAC boundaries.
- Analyzes cash flow, overdue invoices, low stock risks, and KRA eTIMS tax compliance rates.

### 🌍 4. Pluggable Regional Tax Adapters (`CountryAdapter`)
- Supported tax environments:
  - **Kenya (`KE`)**: KRA eTIMS (OSCU / VSCU, 16% VAT)
  - **Nigeria (`NG`)**: FIRS E-Invoicing (7.5% VAT)
  - **Ghana (`GH`)**: GRA E-VAT Fiscal System (15% VAT)
  - **South Africa (`ZA`)**: SARS eFiling VAT (15% VAT)

### 📦 5. Modular Application Suite
- **Point of Sale (`POS`)**: Multi-branch terminal, barcode scanning, M-Pesa STK push trigger, Paystack card checkout, thermal receipt preview, 16% VAT eTIMS calculation.
- **Sales & CRM (`CRM`)**: Customer accounts, deal pipelines, automated WhatsApp follow-ups.
- **Inventory & Warehousing (`Inventory`)**: SKU catalog, multi-warehouse stock levels, reorder alerts.
- **Books & Accounting (`Accounting`)**: Double-entry ledger, tax invoices, accounts receivable.
- **People & HR (`HR`)**: Staff directory, clock-in status, department tracking.
- **Projects & Work (`Projects`)**: Kanban tasks, Gantt milestones, budget tracking, deliverable progress.
- **Customer Desk (`Helpdesk`)**: Support tickets, SLA tracking, priority queues.
- **Hospital & Clinic (`Hospital`)**: Patient intake, doctor assignments, clinical condition tracking.
- **School Management (`School`)**: Student roster, guardian contacts, fee balances.
- **Kenya KRA eTIMS (`eTIMS`)**: OSCU/VSCU fiscalization audit logs, control code signing, QR verification.
- **M-Pesa & Paystack Hub (`Payments`)**: STK push initiation, Paystack card checkout, merchant payment reconciliation.

---

## 🚀 Quick Start & Development

### 1. Interactive Web Preview

Run the dashboard app directly in Chrome:

```powershell
cd apps/dashboard
flutter pub get
flutter run -d chrome
```

### 2. Local Firebase Emulator Setup

```powershell
npm ci
npm --prefix functions ci
npm run emulators
```

In a second terminal:

```powershell
cd apps/dashboard
flutter run -d chrome --dart-define=PREVIEW=false --dart-define=USE_EMULATORS=true
```

---

## 🧪 Verification & Testing

```powershell
# 1. Test Node.js Functions Backend
npm test

# 2. Test Flutter Dashboard Application
cd apps/dashboard
flutter analyze
flutter test

# 3. Production Web Build Validation
flutter build web --release --no-wasm-dry-run
```
