# Source checkout repairs

The donor repositories are independent applications. TallyAssist remains a pre-null-safety application and requires Flutter 2.10.5 / Dart 2.16.2 under `.toolchains`. Open `tallyassist.code-workspace` in a separate VS Code window to use its explicitly configured legacy SDK. Alternatively, open `sources/TallyAssist` directly. Use `sources.code-workspace` for the current-SDK donors, including Hospital. Opening the parent directory alone does not apply TallyAssist's nested VS Code SDK settings. The mixed workspace is not a reliable way to select a separate analysis SDK for TallyAssist; the Dart 3 analyzer reports null-safety errors even in its unchanged `Company` model.

Current compatibility repairs include:

- ClientFlow: lowercase Dart package name matches its `package:clientflow/…` imports.
- HR, attendance, school and original POS: Dart 3-compatible SDK constraints for already null-safe source code.
- FlareLine CRM: `CardThemeData` replaces the removed `CardTheme` data type.
- School: removed button APIs and theme property replaced; custom SearchController disambiguated.
- Original POS: current button colors and dependency APIs; customer dropdown retains asynchronous search and item selection.
- Original POS: optional invoice customers deserialize correctly, Arabic JSON requests use UTF-8, expired customer caches remain writable, and cache tests use independent temporary directories.
- Hospital: removed a nonexistent asset directory declaration.
- TallyAssist: repaired legacy PDF decoration constructors and removed an unsupported theme argument.
- TallyAssist follow-up: replaced deprecated empty-list constructors and theme properties, removed unused imports, and made image selection safe on cancellation or screen disposal. Invoice, due-date, production and khata pickers now support current dates, retain values on cancellation and rebuild after selection. An unselected khata transaction type now reports validation rather than throwing. These fixes do not migrate TallyAssist to Dart 3 or shared organization tenancy.
- TallyAssist uses Provider 4.3.3: Provider 3.2.0 called removed Flutter framework methods and failed test compilation even though application-only analysis passed.
- TallyAssist overrides `platform` to Flutter 2.10's version 3.1.0. Legacy Firebase Messaging pins platform 2, which references the removed `Platform.packageRoot` API and prevents full application compilation.
- HR: declared lint dependency and removed unreachable responsive-layout code.
- Inventory: immutable report widget's user field is final.
- Firebase POS: Flutter-compatible material color dependency, explicit Firebase configuration and correct default Firebase app initialization. Startup no longer clears the offline cache.
- Time tracking and Firebase POS: local Firebase options read explicit Dart defines; missing configuration fails clearly. No real Firebase project or secret is supplied.

Source changes are also exported to `patches/sources/` because `sources/` is ignored in the parent repository. These small patches preserve the checked-out upstream histories. `python scripts/apply-source-fixes.py` checks conflicts before applying and recognizes already-applied changes.

## Check commands

Validation: all 11 Flutter donor applications report zero analyzer errors with their selected SDKs. Warnings and informational diagnostics remain in some donors. Hospital reports no diagnostics. All 67 original POS tests pass, including the expired-cache refresh regression test.

```powershell
python scripts/refresh-source-packages.py
python scripts/check-source-dart.py
```

The analyzer checker writes individual logs and `inventory/source-diagnostics/summary.json`; warnings and informational lints remain visible. A zero-error analyzer result does not establish a successful platform build or a working production backend. Provider, native-platform and Firebase configuration still belongs to each donor application.

TallyAssist follow-up validation: all three date-form/validation widget tests pass, and `flutter build bundle --no-pub` succeeds with its Flutter 2.10.5 SDK. Logs are in `inventory/source-diagnostics/TallyAssist.test.log` and `TallyAssist.bundle.log`. This checks Dart compilation and assets, not an Android APK build or live Firebase operations. The native Android project still emits the legacy embedding warning.

Legacy SDK setup uses the official Flutter `2.10.5` checkout (`5464c5bac742001448fe4fc0597be939379f88ea`) and its pinned Dart engine archive. `scripts/download-legacy-dart.py` verifies archive integrity before extracting and installs `sky_engine`. The legacy apps are development/reference donors, not production deployments on an obsolete runtime.

To resolve a legacy donor's packages, set `FLUTTER_ROOT` to the absolute `.toolchains/flutter-2.10.5` directory, set `PUB_HOSTED_URL=https://pub.dev`, and run that SDK's `bin/cache/dart-sdk/bin/dart.exe pub get` from the donor directory. This avoids using the main application's Dart 3 toolchain on pre-null-safety code.
