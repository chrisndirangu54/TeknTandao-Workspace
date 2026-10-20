import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:tekntandao_workspace/isp_suite_console.dart';

void main() {
  testWidgets('native ISP customer portal presents services and consent', (tester) async {
    tester.view.physicalSize = const Size(1100, 1800);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    await tester.pumpWidget(const MaterialApp(home: IspCustomerPortal()));
    expect(find.text('Fiber, wireless and managed Wi-Fi'), findsOneWidget);
    expect(find.text('Site / estate / general neighborhood'), findsOneWidget);
    expect(find.byType(DropdownButtonFormField<String>), findsOneWidget);
    expect(find.text('I agree to be contacted about this enquiry.'), findsOneWidget);
    expect(find.text('Send service request'), findsOneWidget);
    expect(find.byType(CheckboxListTile), findsOneWidget);
  });
}
