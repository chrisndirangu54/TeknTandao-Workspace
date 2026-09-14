import 'package:flutter/material.dart';
import 'master_catalog.dart';
import 'suite.dart';

const List<SuiteModule> _platformCompatibilityModules = [
  SuiteModule(
    id: 'attendance',
    name: 'Attendance',
    description: 'Employee attendance, clock-in/out and presence records.',
    icon: Icons.fingerprint_rounded,
    color: Color(0xFF0D9488),
    category: 'Human Resources & Workforce',
    monthlyPriceKes: 80000,
  ),
  SuiteModule(
    id: 'time',
    name: 'Time Tracking',
    description: 'Jobs, timesheets and billable time tracking.',
    icon: Icons.schedule_rounded,
    color: Color(0xFF6366F1),
    category: 'Projects, Work & Collaboration',
    monthlyPriceKes: 60000,
  ),
];

final List<SuiteModule> _coreWorkspaceModules = [
  ...modules,
  ..._platformCompatibilityModules,
];

final Set<String> _coreModuleNames = _coreWorkspaceModules
    .map((module) => normalizeModuleName(module.name))
    .toSet();

/// All installable apps shown across workspace, billing and command search.
/// Existing rich modules win when the master catalogue contains the same name.
final List<SuiteModule> workspaceModules = List<SuiteModule>.unmodifiable([
  ..._coreWorkspaceModules,
  ...masterCatalogueModules.where(
    (module) => !_coreModuleNames.contains(normalizeModuleName(module.name)),
  ),
]);

final Map<String, SuiteModule> workspaceModuleById = {
  for (final module in workspaceModules) module.id: module,
};

int get supplementalMasterCatalogueAppCount =>
    workspaceModules.length - _coreWorkspaceModules.length;
