import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:tekntandao_workspace/modules/reseller_studio.dart';
import 'package:tekntandao_workspace/modules/website_builder_runtime.dart';
import 'package:tekntandao_workspace/suite.dart';

class _ResellerStore extends SuiteStore {
  final bool seller;
  _ResellerStore({this.seller = true});
  final calls = <String>[];
  @override
  bool get demo => false;
  @override
  String get orgId => 'test';
  @override
  Future<Map<String, dynamic>> call(
    String name, [
    Map<String, dynamic> data = const {},
  ]) async {
    calls.add(name);
    if (name == 'getResellerStudio') {
      return {
        'enabled': seller,
        'presets': [
          {
            'id': 'business',
            'name': 'Business essentials',
            'category': 'Services',
          },
        ],
        'projects': [],
        'components': [],
        'library': [],
        'usage': [],
        'costs': [],
        'sold': [],
        'bought': [],
        'invoices': [],
      };
    }
    return {'invoices': []};
  }

  @override
  Stream<List<Map<String, dynamic>>> watch(String path) => const Stream.empty();
}

void main() {
  final fixtures =
      (jsonDecode(File('test/fixtures/vetted_sites.json').readAsStringSync())
              as List)
          .map((row) => Map<String, dynamic>.from(row as Map))
          .toList();
  for (final width in [390.0, 1280.0]) {
    for (final document in fixtures) {
      testWidgets('${document['title']} renders and navigates at $width px', (
        tester,
      ) async {
        tester.view.physicalSize = Size(width, 844);
        tester.view.devicePixelRatio = 1;
        addTearDown(tester.view.resetPhysicalSize);
        addTearDown(tester.view.resetDevicePixelRatio);
        await tester.pumpWidget(
          MaterialApp(
            home: Scaffold(body: JsonWebsiteRuntime(document: document)),
          ),
        );
        await tester.pumpAndSettle();
        expect(tester.takeException(), isNull);
        expect(find.text('Contact'), findsOneWidget);
        await tester.tap(find.text('Contact'));
        await tester.pumpAndSettle();
        expect(find.text('Contact us'), findsOneWidget);
        await tester.tap(find.text('Home'));
        await tester.pumpAndSettle();
        expect(
          find.text('A clear introduction to your business'),
          findsOneWidget,
        );
        expect(tester.takeException(), isNull);
      });
    }
  }
  testWidgets('reseller library and costs are usable on a phone', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(390, 844);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    final store = _ResellerStore();
    await tester.pumpWidget(
      MaterialApp(home: ResellerStudioScreen(store: store)),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.text('Create site'));
    await tester.pumpAndSettle();
    expect(store.calls, contains('installVettedSiteTemplate'));
    await tester.tap(find.text('Pricing & costs'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Configure pricing'));
    await tester.pumpAndSettle();
    expect(find.text('Cost + your profit'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
  testWidgets('client owners cannot see seller pricing controls', (
    tester,
  ) async {
    await tester.pumpWidget(
      MaterialApp(
        home: ResellerStudioScreen(store: _ResellerStore(seller: false)),
      ),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.text('Pricing & costs'));
    await tester.pumpAndSettle();
    expect(find.text('Configure pricing'), findsNothing);
    expect(
      find.textContaining('platform-approved reseller access'),
      findsOneWidget,
    );
  });
}
