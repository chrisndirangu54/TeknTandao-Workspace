import 'package:flutter_test/flutter_test.dart';
import 'package:tandao_suite/master_catalog.dart';
import 'package:tandao_suite/workspace_modules.dart';

void main() {
  test('master catalogue exposes all categories and hundreds of apps', () {
    expect(masterCatalogueCategoryCount, 30);
    expect(masterCatalogueSourceAppCount, 653);
    expect(workspaceModules.length, greaterThan(665));

    final ids = workspaceModules.map((module) => module.id).toList();
    expect(
      ids.toSet().length,
      ids.length,
      reason: 'Every installable app ID must be unique',
    );

    expect(
      workspaceModuleById['mc25_mining_operations']?.name,
      'Mining Operations',
    );
    expect(
      workspaceModuleById['mc30_ai_finance_analyst']?.name,
      'AI Finance Analyst',
    );
    expect(workspaceModuleById['mc22_airtel_money']?.name, 'Airtel Money');
    expect(
      workspaceModuleById['mc30_agent_control_center']?.name,
      'Agent Control Center',
    );
    expect(workspaceModuleById['mc11_business_graph']?.name, 'Business Graph');
    expect(
      workspaceModuleById['mc19_cross_border_trade_os']?.name,
      'Cross-Border Trade OS',
    );
    expect(
      workspaceModuleById['mc13_iot_and_device_cloud']?.name,
      'IoT & Device Cloud',
    );
    expect(
      workspaceModuleById['mc25_geo_and_mining_intelligence']?.name,
      'Geo & Mining Intelligence',
    );
    expect(workspaceModuleById['attendance']?.name, 'Attendance');
    expect(workspaceModuleById['time']?.name, 'Time Tracking');
  });
}
