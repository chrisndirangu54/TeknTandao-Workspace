import 'package:flutter/material.dart';
import '../suite.dart';
import '../widgets/record_form.dart';

class SchoolModuleScreen extends StatelessWidget {
  final SuiteStore store;

  const SchoolModuleScreen({super.key, required this.store});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Row(
          children: [
            Icon(Icons.school_rounded, color: Color(0xFF06B6D4)),
            SizedBox(width: 10),
            Text('School Management System'),
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
                const Text('STUDENT ROSTER & FEE STATUS', style: TextStyle(fontSize: 14, fontWeight: FontWeight.bold, color: Color(0xFF64748B))),
                ElevatedButton.icon(
                  onPressed: () async {
                    final details = await recordForm(context, 'Enroll Student', ['Student Name', 'Grade / Class', 'Guardian Name & Phone']);
                    if (details != null && details[0].isNotEmpty) {
                      await store.call('saveRecord', {
                        'appId': 'school',
                        'record': {
                          'name': details[0],
                          'grade': details[1],
                          'guardian': details[2],
                          'feeStatus': 'PENDING',
                          'balanceKes': 3500000,
                        }
                      });
                    }
                  },
                  icon: const Icon(Icons.school_rounded, size: 16),
                  label: const Text('Enroll Student'),
                  style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFF06B6D4), foregroundColor: Colors.white),
                ),
              ],
            ),
            const SizedBox(height: 16),
            StreamBuilder<List<Map<String, dynamic>>>(
              stream: store.watch('students'),
              builder: (context, snapshot) {
                if (!snapshot.hasData) return const CircularProgressIndicator();
                final students = snapshot.data!;
                return Card(
                  child: ListView.separated(
                    shrinkWrap: true,
                    physics: const NeverScrollableScrollPhysics(),
                    itemCount: students.length,
                    separatorBuilder: (context, index) => const Divider(height: 1),
                    itemBuilder: (context, idx) {
                      final s = students[idx];
                      final isPaid = s['feeStatus'] == 'PAID';
                      return ListTile(
                        leading: CircleAvatar(
                          backgroundColor: const Color(0xFF06B6D4).withValues(alpha: 0.1),
                          child: const Icon(Icons.person_rounded, color: Color(0xFF06B6D4)),
                        ),
                        title: Text('${s['name']} (${s['grade']})', style: const TextStyle(fontWeight: FontWeight.bold)),
                        subtitle: Text('Guardian: ${s['guardian']}'),
                        trailing: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            if ((s['balanceKes'] as int) > 0)
                              Text('Bal: ${kes(s['balanceKes'])}', style: const TextStyle(fontWeight: FontWeight.bold, color: Colors.redAccent)),
                            const SizedBox(width: 12),
                            Chip(
                              label: Text(s['feeStatus']),
                              backgroundColor: isPaid ? const Color(0xFFD1FAE5) : const Color(0xFFFEF3C7),
                            ),
                          ],
                        ),
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
