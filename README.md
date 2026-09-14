# African Business Operating System (BizOS)

A multi-tenant, modular business operating system for African SMEs, enterprises, schools, hospitals, retailers, and professional services firms — designed as an AI-native alternative to large business software suites.

---

## 🌟 Key Capabilities

### 🧩 1. Jigsaw Puzzle Workspace Engine (`JigsawCanvas`)
- Administrators manage their company workspace by dragging visual puzzle pieces onto an active canvas.
- Production installation validates the server-side module catalog and automatically provisions required dependencies.
- **Interactive Data Fabric Inspector**: Click connection badges to inspect intended cross-app data routing.

### ♻️ 2. Reuse-first Module Engineering
- Existing audited repositories are preferred as feature donors before equivalent screens/workflows are rebuilt from scratch.
- TeknTandao keeps one authoritative tenancy, RBAC, billing, event-bus and Firestore data contract while donor repositories contribute compatible UI, workflows, calculations and tests.
- Every donor must be pinned to a source commit and pass a license/security/compatibility gate before substantial code is migrated.
- See `docs/REUSE_STRATEGY.md` and `inventory/module-source-map.json` for the current donor map.

### ⌨️ 3. Universal Command Palette (`Cmd/Ctrl + K`)
- Instant search and action dispatcher (`CommandPaletteDialog`).
- Quick actions: Create Customer, Issue Tax Invoice, Register Product SKU, Record POS Sale, Query AI Copilot.

### 🤖 4. AI Business Copilot (`AiCopilotDrawer`)
- Global AI assistant with tenant RBAC boundaries.
- Production AI reports use bounded aggregate business facts and do not send employee or patient notes to the model.

### 🌍 5. Regional Configuration Layer (`CountryAdapter`)
The UI includes country metadata for Kenya, Nigeria, Ghana and South Africa. Tax-provider integrations are not considered production-ready merely because a country adapter is listed. Kenya eTIMS remains blocked until certified OSCU/VSCU configuration and acceptance testing are completed.

### 📦 6. Modular Application Suite
The workspace catalog includes sales, finance, HR, productivity, supply-chain and industry modules. The backend recognizes the same module IDs as the workspace catalog, while individual modules can still be at different implementation depths.

Core implemented workflows include:
- **POS + Inventory**: transaction-safe stock deduction and replay-safe sale creation.
- **CRM**: shared customer records and post-sale follow-up automation.
- **Accounting**: draft invoice creation from POS sales when Accounting is entitled.
- **Subscriptions**: Paystack and M-Pesa subscription billing with server-side verification.
- **AI Reports**: deterministic reporting with optional Gemini narrative generation.

Important integration boundaries:
- **M-Pesa merchant POS checkout is not yet production-enabled.** The visible STK terminal in preview mode is a simulator. Real M-Pesa support currently covers verified Tandao subscription billing.
- **KRA eTIMS fiscal issuance is not yet production-enabled.** Sales create a blocked tax outbox item until taxpayer/device configuration and certified integration are available.

---

## ♻️ Source reuse workflow

The repository inventory already contains pinned candidates for CRM, POS, Inventory, HR, Attendance, Hospital, School, Accounting/Invoicing and Time Tracking. To obtain only approved, pinned donors without executing upstream code:

```powershell
python scripts/sync-module-sources.py
```

Or sync selected modules:

```powershell
python scripts/sync-module-sources.py crm pos time
```

Repositories with missing or unclear license terms remain audit/reference-only until licensing is resolved.

---

## 🚀 Quick Start & Development

### 1. Interactive Web Preview
Preview mode must now be enabled explicitly so a production build can never silently fall back to demo data.

```powershell
cd apps/dashboard
flutter pub get
flutter run -d chrome --dart-define=PREVIEW=true
```

### 2. Local Firebase Emulator Setup

```powershell
npm ci
npm --prefix functions ci
npm run emulators
```

In a second terminal, provide Firebase client configuration and opt into emulators explicitly:

```powershell
cd apps/dashboard
flutter run -d chrome --dart-define=PREVIEW=false --dart-define=USE_EMULATORS=true --dart-define=FIREBASE_PROJECT_ID=demo-tandao --dart-define=FIREBASE_API_KEY=demo-key --dart-define=FIREBASE_APP_ID=1:123:web:demo --dart-define=FIREBASE_MESSAGING_SENDER_ID=123
```

For real environments, prefer `--dart-define-from-file=../../firebase-config.json` as documented in `docs/CONFIGURATION.md`.

---

## 🧪 Verification & Testing

```powershell
# Backend unit tests
npm test

# Firestore rules + Functions integration tests
npm run test:rules

# Flutter checks
cd apps/dashboard
dart format --output=none --set-exit-if-changed lib test
flutter analyze
flutter test

# Explicit preview build
flutter build web --release --dart-define=PREVIEW=true --no-wasm-dry-run

# Production build (requires a complete firebase-config.json)
flutter build web --release --dart-define-from-file=../../firebase-config.json --no-wasm-dry-run
```

GitHub Actions runs these checks on pull requests.
