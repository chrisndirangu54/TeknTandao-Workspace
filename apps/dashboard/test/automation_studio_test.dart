import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:tekntandao_workspace/modules/automation_studio.dart';
import 'package:tekntandao_workspace/suite.dart';

class _Store extends SuiteStore {
  final bool paid;
  _Store({this.paid = true});
  @override
  bool get demo => false;
  @override
  String get orgId => 'workspace';
  final calls = <String>[];
  @override
  Future<Map<String, dynamic>> call(String name, [Map<String, dynamic> data = const {}]) async {
    calls.add(name);
    if (name == 'getAutomationStudio') return {
      'premium': paid, 'connections': [], 'workflows': [], 'runs': [], 'keys': [],
      'features': [{
        'id': 'quote', 'status': 'draft', 'feature': {
          'name': 'Quote calculator', 'description': 'Calculate a quote.',
          'fields': [{'key': 'quantity', 'label': 'Quantity', 'type': 'number', 'required': true}],
          'code': 'return input.quantity * 100;', 'workflowId': null,
        },
      }],
      'mcpUrl': 'https://example.com/mcp',
    };
    if (name == 'previewCustomFeature') return {'result': 400};
    return {};
  }
  @override
  Stream<List<Map<String, dynamic>>> watch(String path) => const Stream.empty();
}

void main() {
  testWidgets('studio renders connections on a phone viewport', (tester) async {
    tester.view.physicalSize = const Size(390, 844);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    await tester.pumpWidget(MaterialApp(home: AutomationStudio(store: _Store())));
    await tester.pumpAndSettle();
    expect(find.text('Connect Google'), findsOneWidget);
    expect(find.text('Connect Notion'), findsOneWidget);
    expect(find.text('Add MCP server'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
  testWidgets('unpaid workspace sees premium gating', (tester) async {
    await tester.pumpWidget(MaterialApp(home: AutomationStudio(store: _Store(paid: false))));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Customization'));
    await tester.pumpAndSettle();
    expect(find.text('Premium customization'), findsOneWidget);
    final button = tester.widget<FilledButton>(find.widgetWithText(FilledButton, 'Describe a feature'));
    expect(button.onPressed, isNull);
  });
  testWidgets('feature preview executes only preview callable', (tester) async {
    final store = _Store();
    await tester.pumpWidget(MaterialApp(home: AutomationStudio(store: store)));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Customization'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Preview'));
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextFormField), '4');
    await tester.tap(find.text('Test preview'));
    await tester.pumpAndSettle();
    expect(store.calls, contains('previewCustomFeature'));
    expect(store.calls, isNot(contains('runCustomFeature')));
    expect(store.calls, isNot(contains('runToolWorkflow')));
    expect(find.textContaining('400'), findsOneWidget);
  });
}
