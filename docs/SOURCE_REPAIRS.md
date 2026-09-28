# Source checkout repairs

The donor repositories are independent applications. TallyAssist and Hospital now use the current Flutter/Dart SDK with the other donors. Open `sources.code-workspace` or the parent workspace; `tallyassist.code-workspace` is an optional single-project view and no longer selects a legacy SDK. Reload the editor window after the SDK migration to restart any already-running Dart 2 analysis server.

Current compatibility repairs include:

- TallyAssist: migrated to null safety, current Flutter/Firebase dependencies, current buttons/themes, PDF preview/sharing, Firebase startup/auth state handling, and Android plugin configuration. See `docs/TALLYASSIST_MIGRATION.md`.

- ClientFlow: lowercase Dart package name matches its `package:clientflow/…` imports.
- HR, attendance, school and original POS: Dart 3-compatible SDK constraints for already null-safe source code.
- FlareLine CRM: `CardThemeData` replaces the removed `CardTheme` data type.
- School: removed button APIs and theme property replaced; custom SearchController disambiguated.
- Original POS: current button colors and dependency APIs; customer dropdown retains asynchronous search and item selection.
- Original POS: optional invoice customers deserialize correctly, Arabic JSON requests use UTF-8, expired customer caches remain writable, and cache tests use independent temporary directories.
- Hospital: removed a nonexistent asset directory declaration.
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
