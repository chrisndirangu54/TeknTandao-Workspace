import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:tandao_suite/dashboard.dart';
import 'package:tandao_suite/suite.dart';

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
    },
  );
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
