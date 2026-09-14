import 'master_catalog.dart';
import 'suite.dart';

final Set<String> _coreModuleNames =
    modules.map((module) => normalizeModuleName(module.name)).toSet();

/// All installable apps shown across workspace, billing and command search.
/// Existing rich modules win when the master catalogue contains the same name.
final List<SuiteModule> workspaceModules = List<SuiteModule>.unmodifiable([
  ...modules,
  ...masterCatalogueModules.where(
    (module) => !_coreModuleNames.contains(normalizeModuleName(module.name)),
  ),
]);

final Map<String, SuiteModule> workspaceModuleById = {
  for (final module in workspaceModules) module.id: module,
};

int get supplementalMasterCatalogueAppCount => workspaceModules.length - modules.length;
