import './index.js';
import {getFirestore} from 'firebase-admin/firestore';
import {HttpsError, onCall} from 'firebase-functions/v2/https';
import {canAccess, identifier} from './domain.js';
import {validateWebsiteDocument, websiteDigest} from './website_builder_domain.js';

const db = getFirestore();
const region = 'europe-west1';
const websiteAppId = 'mc14_website_builder';
const orgRoot = orgId => db.doc(`organizations/${identifier(orgId)}`);

function uid(request) {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in first');
  return request.auth.uid;
}

async function authorize(request) {
  const user = uid(request);
  const org = orgRoot(request.data.orgId);
  const member = (await org.collection('members').doc(user).get()).data();
  const installation = (await org.collection('apps').doc(websiteAppId).get()).data();
  if (!member || !canAccess(member, websiteAppId, installation)) throw new HttpsError('permission-denied', 'Website Builder subscription or permission required');
  return {org};
}

function dartString(value) {
  return String(value).replaceAll('\\', '\\\\').replaceAll("'", "\\'").replaceAll('\n', '\\n').replaceAll('\r', '');
}

function generatedMain(publicId) {
  return `import 'dart:convert';
import 'dart:math';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:url_launcher/url_launcher.dart';

const publicId = '${dartString(publicId)}';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await Firebase.initializeApp();
  runApp(const GeneratedWebsite());
}

class GeneratedWebsite extends StatefulWidget {
  const GeneratedWebsite({super.key});
  @override
  State<GeneratedWebsite> createState() => _GeneratedWebsiteState();
}

class _GeneratedWebsiteState extends State<GeneratedWebsite> {
  Map<String, dynamic>? document;
  String? exposureToken;
  Object? error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final prefs = SharedPreferencesAsync();
      var visitor = await prefs.getString('site_visitor');
      if (visitor == null) {
        final random = Random.secure();
        visitor = List.generate(4, (_) => random.nextInt(1 << 32).toRadixString(16).padLeft(8, '0')).join();
        await prefs.setString('site_visitor', visitor);
      }
      final response = await FirebaseFunctions.instanceFor(region: 'europe-west1')
          .httpsCallable('resolvePublishedWebsiteExperience')
          .call({'publicId': publicId, 'visitorId': visitor, 'path': Uri.base.path.isEmpty ? '/' : Uri.base.path});
      final data = Map<String, dynamic>.from(response.data as Map);
      if (mounted) setState(() {
        document = Map<String, dynamic>.from(data['document'] as Map);
        exposureToken = data['exposureToken']?.toString();
      });
    } catch (e) {
      try {
        final fallback = jsonDecode(await rootBundle.loadString('assets/site.json')) as Map<String, dynamic>;
        if (mounted) setState(() { document = fallback; error = e; });
      } catch (_) {
        if (mounted) setState(() => error = e);
      }
    }
  }

  @override
  Widget build(BuildContext context) => MaterialApp(
        debugShowCheckedModeBanner: false,
        home: document == null
            ? Scaffold(body: Center(child: error == null ? const CircularProgressIndicator() : Text('Unable to load site: $error')))
            : GeneratedRuntime(document: document!, exposureToken: exposureToken),
      );
}

class GeneratedRuntime extends StatelessWidget {
  final Map<String, dynamic> document;
  final String? exposureToken;
  const GeneratedRuntime({super.key, required this.document, this.exposureToken});

  FirebaseFunctions get functions => FirebaseFunctions.instanceFor(region: 'europe-west1');
  Map<String, dynamic> map(dynamic value) => value is Map ? Map<String, dynamic>.from(value) : {};
  List<Map<String, dynamic>> list(dynamic value) => value is List ? value.whereType<Map>().map((v) => Map<String, dynamic>.from(v)).toList() : [];

  String bind(String value, Map<String, dynamic> context) => value.replaceAllMapped(RegExp(r'\\{\\{\\s*([a-zA-Z0-9_.-]+)\\s*\\}\\}'), (m) {
    dynamic current = context;
    for (final part in m.group(1)!.split('.')) {
      if (current is! Map || !current.containsKey(part)) return '';
      current = current[part];
    }
    return current?.toString() ?? '';
  });

  Future<List<Map<String, dynamic>>> cms(String collection, int limit) async {
    final response = await functions.httpsCallable('queryPublishedWebsiteCms').call({'publicId': publicId, 'collectionId': collection, 'limit': limit});
    return (Map<String, dynamic>.from(response.data as Map)['rows'] as List? ?? const []).whereType<Map>().map((e) => Map<String, dynamic>.from(e)).toList();
  }

  Future<Map<String, dynamic>> plugin(String pluginId, String component, Map<String, dynamic> input) async {
    final response = await functions.httpsCallable('resolvePublishedWebsitePlugin').call({'publicId': publicId, 'pluginId': pluginId, 'component': component, 'input': input});
    return Map<String, dynamic>.from(response.data as Map);
  }

  Future<void> conversion(String event) async {
    if (exposureToken == null) return;
    await functions.httpsCallable('recordWebsiteConversion').call({'exposureToken': exposureToken, 'event': event});
  }

  Future<Map<String, dynamic>> submit(String formId, Map<String, String> values, int elapsedMs) async {
    final response = await functions.httpsCallable('submitPublishedWebsiteForm').call({'publicId': publicId, 'formId': formId, 'values': values, 'elapsedMs': elapsedMs, 'honeypot': '', if (exposureToken != null) 'exposureToken': exposureToken});
    return Map<String, dynamic>.from(response.data as Map);
  }

  @override
  Widget build(BuildContext context) {
    final pages = list(document['pages']);
    if (pages.isEmpty) return const Scaffold(body: Center(child: Text('No page')));
    final path = Uri.base.path.isEmpty ? '/' : Uri.base.path;
    final page = pages.firstWhere((page) => page['path'] == path, orElse: () => pages.first);
    return Scaffold(body: SingleChildScrollView(child: _node(map(page['root']), const {})));
  }

  Widget _node(Map<String, dynamic> node, Map<String, dynamic> context) {
    final type = node['type']?.toString() ?? 'text';
    final props = map(node['props']).map((key, value) => MapEntry(key, value is String ? bind(value, context) : value));
    final collection = props['dataCollection']?.toString();
    if (collection != null && collection.isNotEmpty) {
      return FutureBuilder<List<Map<String, dynamic>>>(
        future: cms(collection, ((props['dataLimit'] as num?)?.toInt() ?? 20).clamp(1, 100).toInt()),
        builder: (_, snapshot) {
          if (!snapshot.hasData) return const Center(child: CircularProgressIndicator());
          return Column(children: [for (final row in snapshot.data!) ...list(node['children']).map((child) => _node(child, row))]);
        },
      );
    }
    final pluginId = props['pluginId']?.toString();
    if (pluginId != null && pluginId.isNotEmpty) {
      return FutureBuilder<Map<String, dynamic>>(
        future: plugin(pluginId, props['pluginComponent']?.toString() ?? 'default', context),
        builder: (_, snapshot) {
          if (!snapshot.hasData) return const Center(child: CircularProgressIndicator());
          final fragment = map(snapshot.data!['fragment']);
          return fragment.isEmpty ? Text(map(snapshot.data!['data'])['text']?.toString() ?? '') : _node(fragment, context);
        },
      );
    }
    final children = list(node['children']).map((child) => _node(child, context)).toList();
    switch (type) {
      case 'heading': return Padding(padding: const EdgeInsets.all(8), child: Text(props['text']?.toString() ?? '', style: const TextStyle(fontSize: 38, fontWeight: FontWeight.w800)));
      case 'text': case 'richText': return Padding(padding: const EdgeInsets.all(8), child: Text(props['text']?.toString() ?? ''));
      case 'image': return Image.network(props['imageUrl']?.toString() ?? '', fit: BoxFit.cover, errorBuilder: (_, __, ___) => const SizedBox.shrink());
      case 'button': return Padding(padding: const EdgeInsets.all(8), child: FilledButton(onPressed: () async {
        final event = props['conversionEvent']?.toString();
        if (event != null && event.isNotEmpty) await conversion(event);
        final action = map(node['action']);
        if (action['type'] == 'externalUrl') {
          final uri = Uri.tryParse(action['url']?.toString() ?? '');
          if (uri != null) await launchUrl(uri);
        }
      }, child: Text(props['text']?.toString() ?? 'Button')));
      case 'form': return GeneratedForm(formId: node['id'].toString(), props: props, submit: submit);
      case 'row': return LayoutBuilder(builder: (_, c) => c.maxWidth < 700 ? Column(children: children) : Row(children: children.map((w) => Expanded(child: w)).toList()));
      case 'grid': case 'features': case 'pricing': case 'testimonials': return LayoutBuilder(builder: (_, c) => GridView.count(crossAxisCount: c.maxWidth < 600 ? 1 : ((props['columns'] as num?)?.toInt() ?? 3).clamp(1, 4).toInt(), shrinkWrap: true, physics: const NeverScrollableScrollPhysics(), children: children));
      case 'divider': return const Divider();
      case 'spacer': return SizedBox(height: (props['height'] as num?)?.toDouble() ?? 24);
      default: return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: children);
    }
  }
}

class GeneratedForm extends StatefulWidget {
  final String formId;
  final Map<String, dynamic> props;
  final Future<Map<String, dynamic>> Function(String, Map<String, String>, int) submit;
  const GeneratedForm({super.key, required this.formId, required this.props, required this.submit});
  @override
  State<GeneratedForm> createState() => _GeneratedFormState();
}

class _GeneratedFormState extends State<GeneratedForm> {
  final controllers = <String, TextEditingController>{};
  late final DateTime opened;
  bool busy = false;
  String? message;
  @override
  void initState() {
    super.initState();
    opened = DateTime.now();
    for (var i = 1; i <= 8; i++) if ((widget.props['field$i']?.toString() ?? '').isNotEmpty) controllers['field$i'] = TextEditingController();
    if (controllers.isEmpty) controllers.addAll({'field1': TextEditingController(), 'field2': TextEditingController()});
  }
  @override
  void dispose() { for (final c in controllers.values) c.dispose(); super.dispose(); }
  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.all(16),
    child: Column(children: [
      for (final entry in controllers.entries) Padding(padding: const EdgeInsets.only(bottom: 10), child: TextField(controller: entry.value, decoration: InputDecoration(labelText: widget.props[entry.key]?.toString() ?? entry.key))),
      FilledButton(onPressed: busy ? null : () async {
        setState(() => busy = true);
        try {
          final result = await widget.submit(widget.formId, {for (final e in controllers.entries) e.key: e.value.text.trim()}, DateTime.now().difference(opened).inMilliseconds);
          if (mounted) setState(() => message = result['accepted'] == false ? 'Submission received for review.' : 'Thanks — submitted.');
        } catch (e) {
          if (mounted) setState(() => message = 'Could not submit: $e');
        } finally { if (mounted) setState(() => busy = false); }
      }, child: Text(busy ? 'Sending…' : widget.props['submitText']?.toString() ?? 'Submit')),
      if (message != null) Padding(padding: const EdgeInsets.only(top: 8), child: Text(message!)),
    ]),
  );
}
`;
}

export const exportAdvancedWebsiteFlutterScaffold = onCall({region}, async request => {
  try {
    const {org} = await authorize(request);
    const projectId = identifier(request.data.projectId);
    const snapshot = await org.collection('websiteProjects').doc(projectId).get();
    if (!snapshot.exists) throw new Error('Website project not found');
    const project = snapshot.data();
    const document = validateWebsiteDocument(project.draft);
    return {
      projectId,
      publicId: project.publicId,
      digest: websiteDigest(document),
      files: {
        'pubspec.yaml': `name: generated_website\ndescription: Generated by TeknTandao Website Platform\npublish_to: none\nenvironment:\n  sdk: '>=3.10.0 <4.0.0'\ndependencies:\n  flutter:\n    sdk: flutter\n  firebase_core: ^4.14.0\n  cloud_functions: ^6.4.0\n  shared_preferences: ^2.5.5\n  url_launcher: ^6.3.2\nflutter:\n  uses-material-design: true\n  assets:\n    - assets/site.json\n`,
        'lib/main.dart': generatedMain(project.publicId),
        'assets/site.json': `${JSON.stringify(document, null, 2)}\n`,
        'firebase.json': `${JSON.stringify({hosting: {public: 'build/web', ignore: ['firebase.json', '**/.*', '**/node_modules/**'], rewrites: [{source: '**', destination: '/index.html'}]}}, null, 2)}\n`,
        'README.md': `# ${document.title}\n\nGenerated by the TeknTandao Website Platform. Configure Firebase for the target project and deploy Functions from the TeknTandao backend. The client resolves published JSON through resolvePublishedWebsiteExperience, including A/B assignment, CMS repeaters, remote plugins, public forms and conversion events. assets/site.json is an offline/failure fallback.\n`
      }
    };
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    throw new HttpsError('failed-precondition', String(error?.message || 'Scaffold export failed').slice(0, 1000));
  }
});
