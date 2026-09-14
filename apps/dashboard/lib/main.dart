import 'dart:math';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'cost_aware_store.dart';
import 'dashboard.dart';
import 'modules/website_builder_runtime.dart';
import 'suite.dart';

const useEmulators = bool.fromEnvironment('USE_EMULATORS', defaultValue: false);
const preview = bool.fromEnvironment('PREVIEW', defaultValue: false);

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  if (!preview) {
    const project = String.fromEnvironment('FIREBASE_PROJECT_ID');
    const apiKey = String.fromEnvironment('FIREBASE_API_KEY');
    const appId = String.fromEnvironment('FIREBASE_APP_ID');
    const senderId = String.fromEnvironment('FIREBASE_MESSAGING_SENDER_ID');
    if (project.isEmpty || apiKey.isEmpty || appId.isEmpty || senderId.isEmpty) {
      throw StateError(
        'Missing Firebase configuration. Use --dart-define-from-file for a real environment, '
        'or explicitly pass --dart-define=PREVIEW=true for the demo workspace.',
      );
    }
    await Firebase.initializeApp(
      options: const FirebaseOptions(
        apiKey: apiKey,
        appId: appId,
        messagingSenderId: senderId,
        projectId: project,
        authDomain: '$project.firebaseapp.com',
      ),
    );
    FirebaseFirestore.instance.settings = const Settings(
      persistenceEnabled: true,
      cacheSizeBytes: 104857600,
    );
    if (useEmulators) {
      const host = String.fromEnvironment(
        'EMULATOR_HOST',
        defaultValue: 'localhost',
      );
      await FirebaseAuth.instance.useAuthEmulator(host, 9099);
      FirebaseFirestore.instance.useFirestoreEmulator(host, 8080);
      FirebaseFunctions.instanceFor(
        region: 'europe-west1',
      ).useFunctionsEmulator(host, 5001);
    }
  }
  runApp(const SuiteApp());
}

class SuiteApp extends StatelessWidget {
  const SuiteApp({super.key});

  @override
  Widget build(BuildContext context) => MaterialApp(
        title: 'Tandao | Your business, connected',
        debugShowCheckedModeBanner: false,
        theme: ThemeData(
          useMaterial3: true,
          colorScheme: ColorScheme.fromSeed(
            seedColor: const Color(0xff176b59),
          ),
          scaffoldBackgroundColor: const Color(0xfff5f6f3),
          inputDecorationTheme: const InputDecorationTheme(
            border: OutlineInputBorder(),
          ),
        ),
        home: preview
            ? Dashboard(store: DemoSuiteStore())
            : const RuntimeEntryGate(),
      );
}

class RuntimeEntryGate extends StatefulWidget {
  const RuntimeEntryGate({super.key});

  @override
  State<RuntimeEntryGate> createState() => _RuntimeEntryGateState();
}

class _RuntimeEntryGateState extends State<RuntimeEntryGate> {
  Widget? _resolved;

  @override
  void initState() {
    super.initState();
    _resolve();
  }

  Future<void> _resolve() async {
    if (useEmulators || Uri.base.host.isEmpty || Uri.base.host == 'localhost') {
      if (mounted) setState(() => _resolved = const SignIn());
      return;
    }
    try {
      final preferences = SharedPreferencesAsync();
      var visitorId = await preferences.getString('tekntandao_website_visitor');
      if (visitorId == null || visitorId.isEmpty) {
        final random = Random.secure();
        visitorId = List<int>.generate(4, (_) => random.nextInt(1 << 32))
            .map((part) => part.toRadixString(16).padLeft(8, '0'))
            .join();
        await preferences.setString('tekntandao_website_visitor', visitorId);
      }
      final result = await FirebaseFunctions.instanceFor(region: 'europe-west1')
          .httpsCallable('resolvePublishedWebsiteExperience')
          .call({
        'host': Uri.base.host,
        'path': Uri.base.path.isEmpty ? '/' : Uri.base.path,
        'visitorId': visitorId,
      });
      final data = Map<String, dynamic>.from(result.data as Map);
      final document = Map<String, dynamic>.from(data['document'] as Map);
      if (!mounted) return;
      setState(() {
        _resolved = PublishedWebsiteHost(
          publicId: data['publicId'].toString(),
          document: document,
          exposureToken: data['exposureToken']?.toString(),
          requestedPath: Uri.base.path.isEmpty ? '/' : Uri.base.path,
        );
      });
    } catch (_) {
      if (mounted) setState(() => _resolved = const SignIn());
    }
  }

  @override
  Widget build(BuildContext context) => _resolved ??
      const Scaffold(
        body: Center(child: CircularProgressIndicator()),
      );
}

class PublishedWebsiteHost extends StatelessWidget {
  final String publicId;
  final Map<String, dynamic> document;
  final String? exposureToken;
  final String requestedPath;

  const PublishedWebsiteHost({
    super.key,
    required this.publicId,
    required this.document,
    required this.exposureToken,
    required this.requestedPath,
  });

  FirebaseFunctions get _functions =>
      FirebaseFunctions.instanceFor(region: 'europe-west1');

  Future<List<Map<String, dynamic>>> _cms(String collectionId, int limit) async {
    final result = await _functions.httpsCallable('queryPublishedWebsiteCms').call({
      'publicId': publicId,
      'collectionId': collectionId,
      'limit': limit,
    });
    final data = Map<String, dynamic>.from(result.data as Map);
    return (data['rows'] as List? ?? const [])
        .whereType<Map>()
        .map((row) => Map<String, dynamic>.from(row))
        .toList(growable: false);
  }

  Future<Map<String, dynamic>> _plugin(
    String pluginId,
    String component,
    Map<String, dynamic> input,
  ) async {
    final result = await _functions
        .httpsCallable('resolvePublishedWebsitePlugin')
        .call({
      'publicId': publicId,
      'pluginId': pluginId,
      'component': component,
      'input': input,
    });
    return Map<String, dynamic>.from(result.data as Map);
  }

  Future<Map<String, dynamic>> _submitForm(
    String formId,
    Map<String, String> values,
    int elapsedMs,
  ) async {
    final result = await _functions
        .httpsCallable('submitPublishedWebsiteForm')
        .call({
      'publicId': publicId,
      'formId': formId,
      'values': values,
      'elapsedMs': elapsedMs,
      'honeypot': '',
    });
    return Map<String, dynamic>.from(result.data as Map);
  }

  Future<void> _conversion(String event) async {
    if (exposureToken == null) return;
    await _functions.httpsCallable('recordWebsiteConversion').call({
      'exposureToken': exposureToken,
      'event': event,
    });
  }

  String? _pageId() {
    final pages = siteList(document['pages']);
    final normalized = requestedPath != '/' && requestedPath.endsWith('/')
        ? requestedPath.substring(0, requestedPath.length - 1)
        : requestedPath;
    final page = pages.cast<Map<String, dynamic>?>().firstWhere(
          (item) => item?['path'] == normalized,
          orElse: () => pages.isEmpty ? null : pages.first,
        );
    return page?['id']?.toString();
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        body: JsonWebsiteRuntime(
          document: document,
          pageId: _pageId(),
          cmsResolver: _cms,
          pluginResolver: _plugin,
          formSubmitter: _submitForm,
          conversionRecorder: _conversion,
        ),
      );
}

class SignIn extends StatefulWidget {
  const SignIn({super.key});
  @override
  State<SignIn> createState() => _SignInState();
}

class _SignInState extends State<SignIn> {
  final email = TextEditingController(),
      password = TextEditingController(),
      organization = TextEditingController(),
      workspaceId = TextEditingController();
  bool busy = false, register = false;
  String? error;

  @override
  void dispose() {
    email.dispose();
    password.dispose();
    organization.dispose();
    workspaceId.dispose();
    super.dispose();
  }

  Future<void> submit() async {
    setState(() {
      busy = true;
      error = null;
    });
    try {
      if (register) {
        await FirebaseAuth.instance.createUserWithEmailAndPassword(
          email: email.text.trim(),
          password: password.text,
        );
      } else {
        await FirebaseAuth.instance.signInWithEmailAndPassword(
          email: email.text.trim(),
          password: password.text,
        );
      }
      final functions = FirebaseFunctions.instanceFor(region: 'europe-west1');
      final result = workspaceId.text.trim().isNotEmpty
          ? await functions.httpsCallable('getWorkspaceContext').call({
              'orgId': workspaceId.text.trim(),
            })
          : await functions.httpsCallable('createOrganization').call({
              'name': organization.text.trim().isEmpty
                  ? 'My organization'
                  : organization.text.trim(),
            });
      if (mounted) {
        Navigator.of(context).pushReplacement(
          MaterialPageRoute(
            builder: (_) => Dashboard(
              store: CostAwareFirebaseSuiteStore(result.data['orgId']),
            ),
          ),
        );
      }
    } catch (e) {
      if (mounted) setState(() => error = e.toString());
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        body: Center(
          child: SizedBox(
            width: 420,
            child: Card(
              child: Padding(
                padding: const EdgeInsets.all(32),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Icon(Icons.hub_outlined, size: 48),
                    const SizedBox(height: 16),
                    Text(
                      'Welcome to Tandao',
                      style: Theme.of(context).textTheme.headlineSmall,
                    ),
                    const SizedBox(height: 24),
                    TextField(
                      controller: email,
                      decoration: const InputDecoration(labelText: 'Email'),
                    ),
                    const SizedBox(height: 16),
                    TextField(
                      controller: password,
                      obscureText: true,
                      decoration: const InputDecoration(labelText: 'Password'),
                    ),
                    const SizedBox(height: 16),
                    if (register)
                      TextField(
                        controller: organization,
                        decoration: const InputDecoration(
                          labelText: 'Organization name',
                        ),
                      ),
                    const SizedBox(height: 16),
                    TextField(
                      controller: workspaceId,
                      decoration: const InputDecoration(
                        labelText: 'Shared workspace ID (optional)',
                        helperText: 'Use the ID provided by your workspace owner.',
                      ),
                    ),
                    if (error != null)
                      Padding(
                        padding: const EdgeInsets.all(12),
                        child: Text(
                          error!,
                          style: const TextStyle(color: Colors.red),
                        ),
                      ),
                    const SizedBox(height: 16),
                    FilledButton(
                      onPressed: busy ? null : submit,
                      child: Text(
                        busy
                            ? 'Connecting…'
                            : register
                                ? 'Create workspace'
                                : 'Sign in',
                      ),
                    ),
                    TextButton(
                      onPressed:
                          busy ? null : () => setState(() => register = !register),
                      child: Text(
                        register
                            ? 'Already have an account? Sign in'
                            : 'Create an account',
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      );
}
