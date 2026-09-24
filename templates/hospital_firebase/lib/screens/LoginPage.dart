import 'package:flutter/material.dart';
import 'package:firebase_auth/firebase_auth.dart';

class LoginPage extends StatefulWidget {
  const LoginPage({super.key});
  @override
  State<LoginPage> createState() => _LoginPageState();
}
class _LoginPageState extends State<LoginPage> {
  final email = TextEditingController();
  final password = TextEditingController();
  bool busy = false;
  String? error;
  @override
  void dispose() { email.dispose(); password.dispose(); super.dispose(); }
  Future<void> submit(bool register) async {
    setState(() { busy = true; error = null; });
    try {
      if (register) {
        await FirebaseAuth.instance.createUserWithEmailAndPassword(email: email.text.trim(), password: password.text);
      } else {
        await FirebaseAuth.instance.signInWithEmailAndPassword(email: email.text.trim(), password: password.text);
      }
    } catch (e) { if (mounted) setState(() => error = e.toString()); }
    finally { if (mounted) setState(() => busy = false); }
  }
  @override
  Widget build(BuildContext context) => Scaffold(appBar: AppBar(title: const Text('Patient sign in')),
    body: Center(child: ConstrainedBox(constraints: const BoxConstraints(maxWidth: 440), child: ListView(shrinkWrap: true, padding: const EdgeInsets.all(24), children: [
      TextField(controller: email, keyboardType: TextInputType.emailAddress, decoration: const InputDecoration(labelText: 'Email')),
      TextField(controller: password, obscureText: true, decoration: const InputDecoration(labelText: 'Password')),
      if (error != null) Text(error!),
      FilledButton(onPressed: busy ? null : () => submit(false), child: const Text('Sign in')),
      TextButton(onPressed: busy ? null : () => submit(true), child: const Text('Create patient account')),
      TextButton(onPressed: busy ? null : () async {
        setState(() { busy = true; error = null; });
        try {
          await FirebaseAuth.instance.sendPasswordResetEmail(email: email.text.trim());
          if (mounted) setState(() => error = 'Password reset requested. Check your email.');
        } catch (e) { if (mounted) setState(() => error = e.toString()); }
        finally { if (mounted) setState(() => busy = false); }
      }, child: const Text('Reset password')),
    ]))),
  );
}
