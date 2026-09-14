import 'package:flutter_test/flutter_test.dart';
import 'package:tandao_suite/app_blueprints.dart';
import 'package:tandao_suite/workspace_modules.dart';

void main() {
  test('every installable app resolves to an operational blueprint', () {
    for (final module in workspaceModules) {
      final blueprint = blueprintFor(module);
      expect(blueprint.entityLabel, isNotEmpty, reason: module.id);
      expect(blueprint.fields.length, greaterThanOrEqualTo(4), reason: module.id);
      expect(blueprint.statuses.length, greaterThanOrEqualTo(4), reason: module.id);
      expect(
        blueprint.fields.map((field) => field.key).toSet().length,
        blueprint.fields.length,
        reason: 'Blueprint field keys must be unique for ${module.id}',
      );
    }
  });

  test('important verticals receive domain-specific workflows', () {
    final mining = blueprintFor(workspaceModuleById['mc25_mining_operations']!);
    expect(
      mining.fields.map((field) => field.key),
      containsAll(['site', 'material', 'location']),
    );
    expect(mining.statuses, contains('SAMPLING'));

    final ai = blueprintFor(workspaceModuleById['mc30_ai_finance_analyst']!);
    expect(
      ai.fields.map((field) => field.key),
      containsAll(['goal', 'dataScope', 'guardrail']),
    );
    expect(ai.statuses, contains('REVIEW REQUIRED'));

    final payments = blueprintFor(workspaceModuleById['mc22_airtel_money']!);
    expect(
      payments.fields.map((field) => field.key),
      containsAll(['provider', 'reference', 'amount']),
    );
    expect(payments.statuses, contains('RECONCILED'));

    final health = blueprintFor(workspaceModuleById['mc15_clinic_management']!);
    expect(
      health.fields.map((field) => field.key),
      containsAll(['patient', 'provider', 'service']),
    );

    final publicService = blueprintFor(
      workspaceModuleById['mc27_permit_licensing_system']!,
    );
    expect(
      publicService.fields.map((field) => field.key),
      containsAll(['citizenOrEntity', 'service', 'department']),
    );
  });
}
