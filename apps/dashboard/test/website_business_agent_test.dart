import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:tandao_suite/modules/website_business_agent_screen.dart';
import 'package:tandao_suite/suite.dart';

void main() {
  testWidgets('governed AI Business Operator surface renders deterministically', (
    tester,
  ) async {
    final store = DemoSuiteStore();
    addTearDown(store.dispose);

    // Test the operator surface directly. The previous test mounted the entire
    // Website Studio and then used pumpAndSettle after switching an IndexedStack.
    // That also instantiated the heavyweight visual builder and its runtime
    // children, leaving asynchronous work alive long after the assertion. CI
    // reported every test as passing but flutter test still exited with code 1.
    await tester.pumpWidget(
      MaterialApp(home: WebsiteBusinessAgentScreen(store: store)),
    );
    await tester.pump();

    expect(
      find.textContaining(
        'Business Graph, Inventory, analytics and Agent Control Center',
      ),
      findsOneWidget,
    );

    // Explicitly unmount the feature so test teardown cannot inherit work from
    // any future runtime child added to the operator screen.
    await tester.pumpWidget(const SizedBox.shrink());
    await tester.pump();
  });
}
