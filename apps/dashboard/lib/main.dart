import 'dart:math';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/foundation.dart' show kIsWeb;
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
    if (project.isEmpty ||
        apiKey.isEmpty ||
        appId.isEmpty ||
        senderId.isEmpty) {
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
    title: 'TeknTandao Workspace',
    debugShowCheckedModeBanner: false,
    theme: ThemeData(
      useMaterial3: true,
      colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xff176b59)),
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
        visitorId = List<int>.generate(
          4,
          (_) => random.nextInt(1 << 32),
        ).map((part) => part.toRadixString(16).padLeft(8, '0')).join();
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
  Widget build(BuildContext context) =>
      _resolved ??
      const Scaffold(body: Center(child: CircularProgressIndicator()));
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

  Future<List<Map<String, dynamic>>> _cms(
    String collectionId,
    int limit,
  ) async {
    final result = await _functions
        .httpsCallable('queryPublishedWebsiteCms')
        .call({
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
      fullName = TextEditingController(),
      phoneNumber = TextEditingController(),
      organization = TextEditingController(),
      workspaceId = TextEditingController();
  bool busy = false, register = false;
  String? error;

  @override
  void dispose() {
    email.dispose();
    password.dispose();
    fullName.dispose();
    phoneNumber.dispose();
    organization.dispose();
    workspaceId.dispose();
    super.dispose();
  }

  bool get _hasValidProfileDetails =>
      fullName.text.trim().length >= 2 &&
      fullName.text.trim().length <= 120 &&
      RegExp(r'^[0-9+(). -]{7,24}$').hasMatch(phoneNumber.text.trim());

  Future<void> _ensureProfileDetails(
    User user,
    Map<String, dynamic> profile,
  ) async {
    if (fullName.text.trim().isEmpty) {
      fullName.text =
          profile['displayName']?.toString() ?? user.displayName ?? '';
    }
    if (phoneNumber.text.trim().isEmpty) {
      phoneNumber.text = profile['phoneNumber']?.toString() ?? '';
    }
    if (!_hasValidProfileDetails) {
      if (!mounted) throw StateError('Profile details are required.');
      final completed = await showDialog<bool>(
        context: context,
        builder: (dialogContext) => AlertDialog(
          title: const Text('Complete your profile'),
          content: SizedBox(
            width: 360,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                TextField(
                  controller: fullName,
                  textCapitalization: TextCapitalization.words,
                  decoration: const InputDecoration(labelText: 'Full name'),
                ),
                const SizedBox(height: 16),
                TextField(
                  controller: phoneNumber,
                  keyboardType: TextInputType.phone,
                  decoration: const InputDecoration(labelText: 'Phone number'),
                ),
              ],
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(dialogContext, false),
              child: const Text('Cancel'),
            ),
            FilledButton(
              onPressed: () => Navigator.pop(dialogContext, true),
              child: const Text('Continue'),
            ),
          ],
        ),
      );
      if (completed != true) {
        throw StateError('Enter your name and phone number to continue.');
      }
    }
    if (!_hasValidProfileDetails) {
      throw StateError('Enter a valid name and phone number to continue.');
    }
  }

  Future<String> _resolveWorkspace(User user) async {
    final db = FirebaseFirestore.instance;
    final requestedId = workspaceId.text.trim();
    if (requestedId.isNotEmpty) {
      try {
        final membership = await db
            .doc('organizations/$requestedId/members/${user.uid}')
            .get();
        if (!membership.exists) {
          throw StateError('You are not a member of that workspace.');
        }
        final workspace = await db.doc('organizations/$requestedId').get();
        if (!workspace.exists) {
          throw StateError('That workspace could not be found.');
        }
      } on FirebaseException catch (error) {
        if (error.code == 'permission-denied') {
          throw StateError('You are not a member of that workspace.');
        }
        rethrow;
      }
      return requestedId;
    }

    final workspaceRef = db.collection('organizations').doc(user.uid);
    final memberRef = workspaceRef.collection('members').doc(user.uid);
    final userRef = db.collection('users').doc(user.uid);
    final workspaceName = organization.text.trim().isEmpty
        ? 'My organization'
        : organization.text.trim();
    await db.runTransaction((transaction) async {
      final workspace = await transaction.get(workspaceRef);
      if (workspace.exists) {
        final membership = await transaction.get(memberRef);
        if (!membership.exists || membership.data()?['role'] != 'owner') {
          throw StateError('Your account cannot access its default workspace.');
        }
      } else {
        transaction.set(workspaceRef, {
          'name': workspaceName,
          'createdAt': FieldValue.serverTimestamp(),
          'owner': user.uid,
          'currency': 'KES',
        });
        transaction.set(memberRef, {'role': 'owner', 'apps': <String>[]});
      }
      transaction.set(userRef, {
        'orgId': user.uid,
        'updatedAt': FieldValue.serverTimestamp(),
      }, SetOptions(merge: true));
    });
    return user.uid;
  }

  Future<void> _continueWithUser(User user) async {
    final userRef = FirebaseFirestore.instance
        .collection('users')
        .doc(user.uid);
    final profileSnapshot = await userRef.get();
    final profile = profileSnapshot.data() ?? <String, dynamic>{};
    await _ensureProfileDetails(user, profile);
    final name = fullName.text.trim();
    if (user.displayName != name) await user.updateDisplayName(name);
    await userRef.set({
      'displayName': name,
      'phoneNumber': phoneNumber.text.trim(),
      'email': user.email ?? '',
      'photoURL': user.photoURL ?? '',
      'updatedAt': FieldValue.serverTimestamp(),
    }, SetOptions(merge: true));

    final orgId = await _resolveWorkspace(user);
    if (mounted) {
      Navigator.of(context).pushReplacement(
        MaterialPageRoute(
          builder: (_) => Dashboard(store: CostAwareFirebaseSuiteStore(orgId)),
        ),
      );
    }
  }

  Future<void> submit() async {
    setState(() {
      busy = true;
      error = null;
    });
    try {
      if (register && !_hasValidProfileDetails) {
        throw StateError('Enter your full name and phone number.');
      }
      late final UserCredential credential;
      if (register) {
        credential = await FirebaseAuth.instance.createUserWithEmailAndPassword(
          email: email.text.trim(),
          password: password.text,
        );
      } else {
        credential = await FirebaseAuth.instance.signInWithEmailAndPassword(
          email: email.text.trim(),
          password: password.text,
        );
      }
      final user = credential.user;
      if (user == null) throw StateError('Firebase did not return a user.');
      await _continueWithUser(user);
    } catch (e) {
      if (mounted) setState(() => error = e.toString());
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> signInWithGoogle() async {
    setState(() {
      busy = true;
      error = null;
    });
    try {
      if (!kIsWeb) {
        throw UnsupportedError('Google sign-in is currently available on web.');
      }
      final provider = GoogleAuthProvider()
        ..setCustomParameters({'prompt': 'select_account'});
      final credential = await FirebaseAuth.instance.signInWithPopup(provider);
      final user = credential.user;
      if (user == null) throw StateError('Google did not return a user.');
      await _continueWithUser(user);
    } catch (e) {
      if (mounted) setState(() => error = e.toString());
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  void _toggleRegistration() {
    setState(() {
      register = !register;
      fullName.clear();
      phoneNumber.clear();
      organization.clear();
      error = null;
    });
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    body: SafeArea(
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(24),
        child: Center(
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
                          'Welcome to TeknTandao Workspace',
                      style: Theme.of(context).textTheme.headlineSmall,
                    ),
                    const SizedBox(height: 24),
                    TextField(
                      controller: email,
                      keyboardType: TextInputType.emailAddress,
                      decoration: const InputDecoration(labelText: 'Email'),
                    ),
                    const SizedBox(height: 16),
                    TextField(
                      controller: password,
                      obscureText: true,
                      decoration: const InputDecoration(labelText: 'Password'),
                    ),
                    if (kIsWeb) ...[
                      const SizedBox(height: 16),
                      OutlinedButton.icon(
                        onPressed: busy ? null : signInWithGoogle,
                        icon: const Icon(Icons.account_circle_outlined),
                        label: const Text('Continue with Google'),
                      ),
                    ],
                    if (register) ...[
                      const SizedBox(height: 16),
                      TextField(
                        controller: fullName,
                        textCapitalization: TextCapitalization.words,
                        decoration: const InputDecoration(
                          labelText: 'Full name',
                        ),
                      ),
                      const SizedBox(height: 16),
                      TextField(
                        controller: phoneNumber,
                        keyboardType: TextInputType.phone,
                        decoration: const InputDecoration(
                          labelText: 'Phone number',
                        ),
                      ),
                      const SizedBox(height: 16),
                      TextField(
                        controller: organization,
                        decoration: const InputDecoration(
                          labelText: 'Organization name',
                        ),
                      ),
                    ],
                    const SizedBox(height: 16),
                    TextField(
                      controller: workspaceId,
                      decoration: const InputDecoration(
                        labelText: 'Shared workspace ID (optional)',
                        helperText:
                            'Use the ID provided by your workspace owner.',
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
                      onPressed: busy ? null : _toggleRegistration,
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
      ),
    ),
  );
}
