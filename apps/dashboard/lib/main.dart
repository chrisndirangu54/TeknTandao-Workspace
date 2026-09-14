import 'package:firebase_auth/firebase_auth.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter/material.dart';
import 'suite.dart';
import 'dashboard.dart';

const useEmulators = bool.fromEnvironment('USE_EMULATORS', defaultValue: true);
const preview = bool.fromEnvironment('PREVIEW', defaultValue: true);
Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  if (!preview) {
    const project = String.fromEnvironment(
      'FIREBASE_PROJECT_ID',
      defaultValue: 'demo-tandao',
    );
    await Firebase.initializeApp(
      options: const FirebaseOptions(
        apiKey: String.fromEnvironment(
          'FIREBASE_API_KEY',
          defaultValue: 'demo-key',
        ),
        appId: String.fromEnvironment(
          'FIREBASE_APP_ID',
          defaultValue: '1:123:web:demo',
        ),
        messagingSenderId: String.fromEnvironment(
          'FIREBASE_MESSAGING_SENDER_ID',
          defaultValue: '123',
        ),
        projectId: project,
        authDomain: '$project.firebaseapp.com',
      ),
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
      colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xff176b59)),
      scaffoldBackgroundColor: const Color(0xfff5f6f3),
      inputDecorationTheme: const InputDecorationTheme(
        border: OutlineInputBorder(),
      ),
    ),
    home: preview ? Dashboard(store: DemoSuiteStore()) : const SignIn(),
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
            builder: (_) =>
                Dashboard(store: FirebaseSuiteStore(result.data['orgId'])),
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
                  onPressed: busy
                      ? null
                      : () => setState(() => register = !register),
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
