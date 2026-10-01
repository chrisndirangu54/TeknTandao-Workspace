import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:tekntandao_workspace/dashboard.dart';
import 'package:tekntandao_workspace/modules/hr_module.dart';
import 'package:tekntandao_workspace/suite.dart';

void main() {
  test(
    'connected preview sale shares stock, invoice and follow-up once',
    () async {
      final store = DemoSuiteStore();
      for (final app in ['crm', 'inventory', 'pos', 'accounting']) {
        await store.call('installApp', {'appId': app});
      }
      await store.call('saveRecord', {
        'appId': 'crm',
        'record': {'name': 'Customer'},
      });
      await store.call('saveRecord', {
        'appId': 'inventory',
        'record': {'name': 'Tea', 'price': 10000, 'stock': 4},
      });
      final sale = {
        'requestId': 'one',
        'productId': store.records['products']!.first['id'],
        'contactId': store.records['contacts']!.first['id'],
        'quantity': 2,
      };
      await store.call('createSale', sale);
      await store.call('createSale', sale);
      expect(store.records['products']!.first['stock'], 2);
      expect(store.records['invoices']!.length, 1);
      expect(store.records['tasks']!.length, 1);
      final books = await store.call('getTrialBalance');
      final rows = books['rows'] as List;
      final ar = rows.cast<Map>().firstWhere((row) => row['account'] == '1100');
      expect(ar['balance'], 20000);
    },
  );
  test('preview statutory payroll matches the February 2026 worked example', () async {
    final store = DemoSuiteStore();
    for (final app in ['payroll', 'accounting', 'hr']) {
      await store.call('installApp', {'appId': app});
    }
    await store.call('saveRecord', {
      'appId': 'hr',
      'record': {'name': 'Amina', 'role': 'Accountant', 'department': 'Finance', 'branch': 'Nairobi'},
    });
    final employeeId = store.records['employees']!.single['id'];
    final slip = await store.call('runStatutoryPayroll', {
      'employeeId': employeeId,
      'period': '2026-09',
      'grossMinor': 10000000,
    });
    expect(slip['rateCard'], 'KE-2026-02');
    expect(slip['netMinor'], 7044200);
    expect(slip['payeMinor'], 1930800);
    expect(slip['nssfEmployeeMinor'], 600000);
    expect(slip['shifMinor'], 275000);
    expect(slip['housingEmployeeMinor'], 150000);
    final again = await store.call('runStatutoryPayroll', {
      'employeeId': employeeId,
      'period': '2026-09',
      'grossMinor': 10000000,
    });
    expect(again['alreadyPosted'], isTrue);
    expect(store.records['payrollPayslips']!.length, 1);
    final low = await store.call('runStatutoryPayroll', {
      'employeeId': employeeId,
      'period': '2026-10',
      'grossMinor': 1000000,
    });
    expect(low['shifMinor'], 30000);
    final books = await store.call('getTrialBalance');
    final rows = (books['rows'] as List).cast<Map>();
    expect(rows.fold<int>(0, (sum, row) => sum + (row['balance'] as int)), 0);
    expect(rows.firstWhere((row) => row['account'] == '2140')['balance'], -7044200 - (low['netMinor'] as int));
  });
  testWidgets('people screen posts a February 2026 payslip into the preview ledger', (tester) async {
    tester.view.physicalSize = const Size(1440, 1600);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    final store = DemoSuiteStore();
    for (final app in ['payroll', 'accounting']) {
      await store.call('installApp', {'appId': app});
    }
    await tester.pumpWidget(MaterialApp(home: HrModuleScreen(store: store)));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Add Employee'));
    await tester.pumpAndSettle();
    final staffFields = find.byType(TextField);
    await tester.enterText(staffFields.at(0), 'Amina');
    await tester.enterText(staffFields.at(1), 'Accountant');
    await tester.enterText(staffFields.at(2), 'Finance');
    await tester.enterText(staffFields.at(3), 'Nairobi');
    await tester.tap(find.text('Save'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Amina'));
    await tester.pumpAndSettle();
    await tester.tap(find.textContaining('Run Payroll'));
    await tester.pumpAndSettle();
    final payFields = find.byType(TextField);
    await tester.enterText(payFields.at(0), '2026-09');
    await tester.enterText(payFields.at(1), '100000');
    await tester.tap(find.text('Save'));
    await tester.pumpAndSettle();
    expect(find.textContaining('Amina · 2026-09'), findsOneWidget);
    expect(find.textContaining('KES 70442.00'), findsWidgets);
    expect(find.textContaining('KE-2026-02'), findsWidgets);
    final books = await store.call('getTrialBalance');
    final rows = (books['rows'] as List).cast<Map>();
    expect(rows.fold<int>(0, (sum, row) => sum + (row['balance'] as int)), 0);
  });
  testWidgets('workspace add button installs an app and opens its screen', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(1440, 1200);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    final store = DemoSuiteStore();
    await tester.pumpWidget(MaterialApp(home: Dashboard(store: store)));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('add-crm')));
    await tester.pumpAndSettle();
    expect(store.records['apps']!.single['id'], 'crm');
    await tester.tap(find.byKey(const Key('open-crm')));
    await tester.pumpAndSettle();
    expect(find.text('Add record'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}
