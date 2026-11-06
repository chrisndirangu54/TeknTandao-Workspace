import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:tandao_suite/modules/website_business_agent_screen.dart';
import 'package:tandao_suite/suite.dart';

void main() {
  testWidgets('Website Studio exposes the governed AI Business Operator surface', (
    tester,
  ) async {
    await tester.pumpWidget(
      MaterialApp(home: WebsiteBusinessStudioScreen(store: DemoSuiteStore())),
    );
    await tester.pump();

    expect(find.text('Website Studio'), findsOneWidget);
    expect(find.text('AI Business Operator'), findsOneWidget);

    await tester.tap(find.text('AI Business Operator'));
    await tester.pumpAndSettle();

    expect(
      find.textContaining('Business Graph, Inventory, analytics and Agent Control Center'),
      findsOneWidget,
    );
  });
}
