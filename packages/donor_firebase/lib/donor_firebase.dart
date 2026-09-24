import 'package:flutter/material.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';

Future<void>? _initialization;
Future<void> initializeDonorFirebase() => _initialization ??= _initialize();
Future<void> _initialize() async {
  const key = String.fromEnvironment('FIREBASE_API_KEY');
  const app = String.fromEnvironment('FIREBASE_APP_ID');
  const project = String.fromEnvironment('FIREBASE_PROJECT_ID');
  const sender = String.fromEnvironment('FIREBASE_MESSAGING_SENDER_ID');
  if (Firebase.apps.isNotEmpty) return;
  if ([key, app, project, sender].any((value) => value.isEmpty)) {
    throw StateError('Configure FIREBASE_API_KEY, FIREBASE_APP_ID, FIREBASE_PROJECT_ID and FIREBASE_MESSAGING_SENDER_ID using Dart defines.');
  }
  await Firebase.initializeApp(options: const FirebaseOptions(
    apiKey: key, appId: app, projectId: project, messagingSenderId: sender,
  ));
}

/// Uses the suite's organization membership, subscriptions and callable writes.
/// No donor-specific database or permissive client write rules are introduced.
class FirebaseDonorPanel extends StatefulWidget {
  final String title;
  final String appId;
  final String collection;
  final Map<String, String> fields;
  final String? recordKind;
  final bool readOnly;
  const FirebaseDonorPanel({super.key, required this.title, required this.appId,
    required this.collection, required this.fields, this.recordKind, this.readOnly = false});
  @override
  State<FirebaseDonorPanel> createState() => _FirebaseDonorPanelState();
}

class _FirebaseDonorPanelState extends State<FirebaseDonorPanel> {
  late final Future<void> ready = initializeDonorFirebase();
  final email = TextEditingController();
  final password = TextEditingController();
  bool busy = false;
  String? error;
  static const org = String.fromEnvironment('TANDAO_ORG_ID');
  @override
  void dispose() { email.dispose(); password.dispose(); super.dispose(); }

  Future<void> run(Future<void> Function() action) async {
    if (busy) return;
    setState(() { busy = true; error = null; });
    try { await action(); }
    catch (e) { if (mounted) setState(() => error = e.toString()); }
    finally { if (mounted) setState(() => busy = false); }
  }

  Future<void> addRecord([String? id, Map<String, dynamic>? existing]) async {
    final controllers = {for (final key in widget.fields.keys) key: TextEditingController(text: '${existing?[key] ?? ''}')};
    final values = await showDialog<Map<String, String>>(context: context, builder: (context) => AlertDialog(
      title: Text('${id == null ? 'Add' : 'Edit'} ${widget.title.toLowerCase()}'),
      content: SizedBox(width: 400, child: SingleChildScrollView(child: Column(mainAxisSize: MainAxisSize.min, children: [
        for (final field in widget.fields.entries) TextField(controller: controllers[field.key], decoration: InputDecoration(labelText: field.value)),
      ]))),
      actions: [TextButton(onPressed: () => Navigator.pop(context), child: const Text('Cancel')),
        FilledButton(onPressed: () => Navigator.pop(context, {for (final entry in controllers.entries) entry.key: entry.value.text.trim()}), child: const Text('Save'))],
    ));
    // Dialog widgets may still be mounted during the reverse transition.
    await Future<void>.delayed(const Duration(milliseconds: 300));
    for (final controller in controllers.values) { controller.dispose(); }
    if (values == null || !mounted) return;
    await run(() async {
      if ((values['name'] ?? '').isEmpty) throw ArgumentError('Name is required');
      await FirebaseFunctions.instanceFor(region: 'europe-west1').httpsCallable(widget.recordKind == null ? 'saveRecord' : 'saveModuleRecord').call({
        'orgId': org, 'appId': widget.appId, 'record': values,
        if (id != null) 'id': id,
        if (widget.recordKind != null) 'kind': widget.recordKind,
      });
    });
  }

  @override
  Widget build(BuildContext context) => FutureBuilder<void>(future: ready, builder: (context, setup) {
    if (setup.hasError) return Text('Firebase setup required: ${setup.error}');
    if (setup.connectionState != ConnectionState.done) return const LinearProgressIndicator();
    if (org.isEmpty || !RegExp(r'^[A-Za-z0-9_-]+$').hasMatch(org)) return const Text('Set TANDAO_ORG_ID to your organization ID.');
    return StreamBuilder<User?>(stream: FirebaseAuth.instance.authStateChanges(), builder: (context, session) {
      return Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Text(widget.title, style: Theme.of(context).textTheme.titleLarge),
        if (error != null) Text(error!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
        if (session.data == null) ...[
          TextField(controller: email, decoration: const InputDecoration(labelText: 'Email')),
          TextField(controller: password, obscureText: true, decoration: const InputDecoration(labelText: 'Password')),
          FilledButton(onPressed: busy ? null : () => run(() async {
            await FirebaseAuth.instance.signInWithEmailAndPassword(email: email.text.trim(), password: password.text);
            password.clear();
          }), child: const Text('Sign in')),
        ] else ...[
          Wrap(spacing: 12, children: [
            if (!widget.readOnly) FilledButton(onPressed: busy ? null : () => addRecord(), child: const Text('Add record')),
            TextButton(onPressed: busy ? null : () => run(FirebaseAuth.instance.signOut), child: const Text('Sign out')),
          ]),
          StreamBuilder<QuerySnapshot<Map<String, dynamic>>>(
            key: ValueKey('${session.data!.uid}/${widget.collection}'),
            stream: (widget.recordKind == null
                ? FirebaseFirestore.instance.collection('organizations/$org/${widget.collection}')
                : FirebaseFirestore.instance.collection('organizations/$org/${widget.collection}').where('kind', isEqualTo: widget.recordKind))
                .orderBy('updatedAt', descending: true).limit(100).snapshots(),
            builder: (context, snapshot) {
              if (snapshot.hasError) return Text('Could not load records: ${snapshot.error}');
              if (!snapshot.hasData) return const LinearProgressIndicator();
              if (snapshot.data!.docs.isEmpty) return const Text('No records yet.');
              return Column(mainAxisSize: MainAxisSize.min, children: [
                const Text('Latest 100 records'),
                if (widget.readOnly) Text('Records: ${snapshot.data!.docs.length}. Recorded value (minor units): ${snapshot.data!.docs.fold<num>(0, (sum, doc) => sum + (doc.data()['valueMinor'] is num ? doc.data()['valueMinor'] as num : 0))}. This is pipeline value, not collected revenue.'),
                for (final doc in snapshot.data!.docs) ListTile(
                  title: Text('${doc.data()['name'] ?? doc.id}'),
                  trailing: widget.readOnly ? null : IconButton(tooltip: 'Edit', onPressed: busy ? null : () => addRecord(doc.id, doc.data()), icon: const Icon(Icons.edit)),
                  subtitle: Text(widget.fields.keys.where((key) => key != 'name').map((key) => '${widget.fields[key]}: ${doc.data()[key] ?? ''}').join('\n')),
                ),
              ]);
            },
          ),
        ],
      ]);
    });
  });
}
