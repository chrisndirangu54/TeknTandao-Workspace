import 'package:flutter/material.dart';
import '../suite.dart';
import '../widgets/record_form.dart';
import 'connected_records.dart';
import 'hospital_operations.dart';

class HospitalModuleScreen extends StatelessWidget {
  final SuiteStore store;

  const HospitalModuleScreen({super.key, required this.store});

  @override
  Widget build(BuildContext context) {
    return DefaultTabController(
      length: 2,
      child: Scaffold(
        appBar: AppBar(title: const Text('Hospital & Clinic'), actions: [IconButton(tooltip: 'Hospital operations', icon: const Icon(Icons.settings), onPressed: () => Navigator.push(context, MaterialPageRoute<void>(builder: (_) => HospitalOperations(store: store))))], bottom: const TabBar(tabs: [
          Tab(text: 'Patients'), Tab(text: 'Clinical records'),
        ])),
        body: TabBarView(children: [
          _PatientDirectory(store: store),
          ConnectedRecords(store: store, appId: 'hospital', types: hospitalRecordTypes),
        ]),
      ),
    );
  }
}

class _PatientDirectory extends StatelessWidget {
  final SuiteStore store;
  const _PatientDirectory({required this.store});
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Row(
          children: [
            Icon(Icons.local_hospital_rounded, color: Color(0xFFEF4444)),
            SizedBox(width: 10),
            Text('Hospital & Clinic Management'),
          ],
        ),
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                const Text('PATIENT DIRECTORY & CLINICAL ADMISSIONS', style: TextStyle(fontSize: 14, fontWeight: FontWeight.bold, color: Color(0xFF64748B))),
                ElevatedButton.icon(
                  onPressed: () async {
                    final details = await recordForm(context, 'Register New Patient', ['Patient Name', 'Age', 'Gender', 'Assigned Doctor', 'Condition Note']);
                    if (details != null && details[0].isNotEmpty) {
                      await store.call('saveRecord', {
                        'appId': 'hospital',
                        'record': {
                          'name': details[0],
                          'age': int.tryParse(details[1]) ?? 30,
                          'gender': details[2],
                          'doctor': details[3],
                          'condition': details[4],
                          'status': 'Registered',
                        }
                      });
                    }
                  },
                  icon: const Icon(Icons.person_add_rounded, size: 16),
                  label: const Text('Register Patient'),
                  style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFFEF4444), foregroundColor: Colors.white),
                ),
              ],
            ),
            const SizedBox(height: 16),
            StreamBuilder<List<Map<String, dynamic>>>(
              stream: store.watch('patients'),
              builder: (context, snapshot) {
                if (!snapshot.hasData) return const CircularProgressIndicator();
                final patients = snapshot.data!;
                return Card(
                  child: ListView.separated(
                    shrinkWrap: true,
                    physics: const NeverScrollableScrollPhysics(),
                    itemCount: patients.length,
                    separatorBuilder: (context, index) => const Divider(height: 1),
                    itemBuilder: (context, idx) {
                      final p = patients[idx];
                      return ListTile(
                        leading: CircleAvatar(
                          backgroundColor: const Color(0xFFEF4444).withValues(alpha: 0.1),
                          child: const Icon(Icons.medical_services_rounded, color: Color(0xFFEF4444)),
                        ),
                        title: Text('${p['name']} (${p['age']} yrs, ${p['gender']})', style: const TextStyle(fontWeight: FontWeight.bold)),
                        subtitle: Text('Patient ID: ${p['id']}\nDoctor: ${p['doctor']} · Condition: ${p['condition']}'),
                        trailing: Chip(label: Text(p['status']), backgroundColor: const Color(0xFFFEE2E2)),
                      );
                    },
                  ),
                );
              },
            ),
          ],
        ),
      ),
    );
  }
}
