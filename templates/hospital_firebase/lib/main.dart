import 'package:flutter/material.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:donor_firebase/donor_firebase.dart';
import 'screens/LoginPage.dart';
import 'screens/Dashboard.dart';

void main() { WidgetsFlutterBinding.ensureInitialized(); runApp(const MyApp()); }

class MyApp extends StatelessWidget {
  const MyApp({super.key});
  static final Future<void> ready = initializeDonorFirebase();
  @override
  Widget build(BuildContext context) => MaterialApp(
    title: 'Hospital patient portal',
    theme: ThemeData(colorSchemeSeed: Colors.teal, useMaterial3: true),
    home: FutureBuilder<void>(future: ready, builder: (context, snapshot) {
      if (snapshot.hasError) return Scaffold(body: Center(child: Text('Firebase configuration required: ${snapshot.error}')));
      if (snapshot.connectionState != ConnectionState.done) return const Scaffold(body: Center(child: CircularProgressIndicator()));
      return StreamBuilder<User?>(stream: FirebaseAuth.instance.authStateChanges(), builder: (context, user) =>
        user.data == null ? const LoginPage() : Dashboard(key: ValueKey(user.data!.uid)));
    }),
  );
}
