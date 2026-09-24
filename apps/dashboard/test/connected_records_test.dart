import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:tandao_suite/modules/connected_records.dart';
import 'package:tandao_suite/suite.dart';

void main() {
  testWidgets('clinical records display only the selected module and type', (tester) async {
    final store = DemoSuiteStore();
    await store.call('saveModuleRecord', {
      'appId': 'hospital', 'kind': 'prescription',
      'record': {'name': 'Prescription A', 'patientId': 'patient_1', 'medicine': 'Medicine', 'instructions': 'As directed'},
    });
    await store.call('saveModuleRecord', {
      'appId': 'school', 'kind': 'announcement', 'record': {'name': 'School only'},
    });
    await tester.pumpWidget(MaterialApp(home: Scaffold(body: ConnectedRecords(
      store: store, appId: 'hospital', types: hospitalRecordTypes,
    ))));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Prescriptions'));
    await tester.pumpAndSettle();
    expect(find.text('Prescription A'), findsOneWidget);
    expect(find.text('School only'), findsNothing);
    expect(find.textContaining('patient_1'), findsOneWidget);
  });
}
