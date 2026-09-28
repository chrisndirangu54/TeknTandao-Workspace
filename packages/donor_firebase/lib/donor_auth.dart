import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/foundation.dart';
import 'donor_firebase.dart' show initializeDonorFirebase;

abstract interface class DonorAuthenticator {
  Future<void> signIn(String email, String password);
  Future<void> register(String email, String password);
  Future<void> signInWithProvider(String provider);
  Future<void> resetPassword(String email);
}

class FirebaseDonorAuthenticator implements DonorAuthenticator {
  Future<void> signOut() async {
    await initializeDonorFirebase();
    await FirebaseAuth.instance.signOut();
  }
  @override
  Future<void> signIn(String email, String password) async {
    await initializeDonorFirebase();
    await FirebaseAuth.instance.signInWithEmailAndPassword(email: email.trim(), password: password);
  }
  @override
  Future<void> register(String email, String password) async {
    await initializeDonorFirebase();
    await FirebaseAuth.instance.createUserWithEmailAndPassword(email: email.trim(), password: password);
  }
  @override
  Future<void> signInWithProvider(String provider) async {
    final AuthProvider credential = switch (provider) {
      'google' => GoogleAuthProvider(),
      'github' => GithubAuthProvider(),
      'microsoft' => MicrosoftAuthProvider(),
      _ => throw ArgumentError('Unsupported sign-in provider'),
    };
    await initializeDonorFirebase();
    if (kIsWeb) {
      await FirebaseAuth.instance.signInWithPopup(credential);
    } else {
      await FirebaseAuth.instance.signInWithProvider(credential);
    }
  }
  @override
  Future<void> resetPassword(String email) async {
    await initializeDonorFirebase();
    await FirebaseAuth.instance.sendPasswordResetEmail(email: email.trim());
  }
}
