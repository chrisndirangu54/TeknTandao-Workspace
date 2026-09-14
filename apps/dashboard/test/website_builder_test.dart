import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:tandao_suite/modules/website_builder_runtime.dart';

Map<String, dynamic> sampleSite() => {
      'title': 'Runtime Site',
      'theme': {
        'primaryColor': '#2563EB',
        'backgroundColor': '#FFFFFF',
        'textColor': '#0F172A',
        'maxContentWidth': 1200,
      },
      'pages': [
        {
          'id': 'home',
          'name': 'Home',
          'path': '/',
          'root': {
            'id': 'home_root',
            'type': 'page',
            'props': {},
            'style': {},
            'children': [
              {
                'id': 'headline',
                'type': 'heading',
                'props': {'text': 'Rendered from JSON'},
                'style': {'fontSize': 42},
                'responsive': {
                  'mobile': {'fontSize': 28},
                },
                'children': [],
              },
              {
                'id': 'copy',
                'type': 'text',
                'props': {'text': 'No Flutter rebuild is required for content updates.'},
                'children': [],
              },
            ],
          },
        },
      ],
    };

void main() {
  test('responsive breakpoint resolver is deterministic', () {
    expect(websiteBreakpoint(390), 'mobile');
    expect(websiteBreakpoint(820), 'tablet');
    expect(websiteBreakpoint(1200), 'desktop');
    expect(websiteBreakpoint(1600), 'wide');
    final node = sampleSite()['pages'][0]['root']['children'][0]
        as Map<String, dynamic>;
    expect(resolvedNodeStyle(node, 390)['fontSize'], 28);
    expect(resolvedNodeStyle(node, 1200)['fontSize'], 42);
  });

  test('node lookup finds nested JSON components by stable id', () {
    final node = findWebsiteNode(sampleSite(), 'copy');
    expect(node?['type'], 'text');
    expect(node?['props']['text'], contains('No Flutter rebuild'));
  });

  testWidgets('runtime renders website content directly from JSON', (
    tester,
  ) async {
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: SizedBox(
            width: 1200,
            child: JsonWebsiteRuntime(document: sampleSite()),
          ),
        ),
      ),
    );
    await tester.pump();
    expect(find.text('Rendered from JSON'), findsOneWidget);
    expect(
      find.text('No Flutter rebuild is required for content updates.'),
      findsOneWidget,
    );
  });
}
