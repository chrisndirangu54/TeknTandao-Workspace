import 'package:flutter/material.dart';
import 'package:firebase_auth/firebase_auth.dart';
import '../services/HospitalService.dart';
import 'PatientRecords.dart';

class Dashboard extends StatefulWidget {
  const Dashboard({super.key});
  @override
  State<Dashboard> createState() => _DashboardState();
}
class _DashboardState extends State<Dashboard> {
  final api = HospitalService();
  late Future<Map<String, dynamic>> overview = api.call('hospitalPortalOverview');
  final name = TextEditingController();
  final phone = TextEditingController();
  bool busy = false;
  String? error;
  @override
  void dispose() { name.dispose(); phone.dispose(); super.dispose(); }
  Future<void> register() async {
    setState(() { busy = true; error = null; });
    try {
      await api.call('hospitalRegisterPatient', {'name': name.text.trim(), 'phone': phone.text.trim()});
      if (mounted) setState(() => overview = api.call('hospitalPortalOverview'));
    } catch (e) { if (mounted) setState(() => error = e.toString()); }
    finally { if (mounted) setState(() => busy = false); }
  }
  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('Patient portal'), actions: [TextButton(onPressed: () => FirebaseAuth.instance.signOut(), child: const Text('Sign out'))]),
    body: FutureBuilder<Map<String, dynamic>>(future: overview, builder: (context, snapshot) {
      if (snapshot.hasError) return Center(child: Column(mainAxisSize: MainAxisSize.min, children: [Text('Could not load portal: ${snapshot.error}'), TextButton(onPressed: () => setState(() => overview = api.call('hospitalPortalOverview')), child: const Text('Retry'))]));
      if (!snapshot.hasData) return const Center(child: CircularProgressIndicator());
      if (snapshot.data!['registered'] != true) return ListView(padding: const EdgeInsets.all(24), children: [
        const Text('Complete your patient profile'),
        TextField(controller: name, decoration: const InputDecoration(labelText: 'Full name')),
        TextField(controller: phone, decoration: const InputDecoration(labelText: 'Contact phone')),
        if (error != null) Text(error!),
        FilledButton(onPressed: busy ? null : register, child: const Text('Register with this hospital')),
      ]);
      return ListView(padding: const EdgeInsets.all(16), children: [
        Text('Welcome, ${snapshot.data!['name']}'),
        for (final entry in const {'appointment': 'Appointments', 'prescription': 'Prescriptions', 'labTest': 'Lab tests', 'labReport': 'Lab reports', 'history': 'Medical history', 'bills': 'Bills and payments'}.entries)
          ListTile(title: Text(entry.value), trailing: const Icon(Icons.chevron_right), onTap: () => Navigator.push(context, MaterialPageRoute<void>(builder: (_) => PatientRecords(kind: entry.key, title: entry.value)))),
      ]);
    }),
  );
}
