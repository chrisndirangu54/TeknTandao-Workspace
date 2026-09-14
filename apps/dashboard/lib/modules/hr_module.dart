import 'package:flutter/material.dart';
import '../suite.dart';
import '../widgets/record_form.dart';

class HrModuleScreen extends StatelessWidget {
  final SuiteStore store;

  const HrModuleScreen({super.key, required this.store});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Row(
          children: [
            Icon(Icons.badge_rounded, color: Color(0xFFEC4899)),
            SizedBox(width: 10),
            Text('People & Attendance System'),
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
                const Text('EMPLOYEE DIRECTORY & CLOCK-IN STATUS', style: TextStyle(fontSize: 14, fontWeight: FontWeight.bold, color: Color(0xFF64748B))),
                ElevatedButton.icon(
                  onPressed: () async {
                    final details = await recordForm(context, 'Add New Staff Member', ['Full Name', 'Job Role', 'Department', 'Branch']);
                    if (details != null && details[0].isNotEmpty) {
                      await store.call('saveRecord', {
                        'appId': 'hr',
                        'record': {
                          'name': details[0],
                          'role': details[1],
                          'department': details[2],
                          'branch': details[3],
                          'status': 'CLOCKED_IN',
                          'clockTime': '08:00 AM',
                        }
                      });
                    }
                  },
                  icon: const Icon(Icons.person_add_alt_1_rounded, size: 16),
                  label: const Text('Add Employee'),
                  style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFFEC4899), foregroundColor: Colors.white),
                ),
              ],
            ),
            const SizedBox(height: 16),
            StreamBuilder<List<Map<String, dynamic>>>(
              stream: store.watch('employees'),
              builder: (context, snapshot) {
                if (!snapshot.hasData) return const CircularProgressIndicator();
                final staff = snapshot.data!;
                return Card(
                  child: ListView.separated(
                    shrinkWrap: true,
                    physics: const NeverScrollableScrollPhysics(),
                    itemCount: staff.length,
                    separatorBuilder: (context, index) => const Divider(height: 1),
                    itemBuilder: (context, idx) {
                      final e = staff[idx];
                      final isClockedIn = e['status'] == 'CLOCKED_IN';
                      return ListTile(
                        leading: CircleAvatar(
                          backgroundColor: const Color(0xFFEC4899).withValues(alpha: 0.1),
                          child: Text(e['name'][0], style: const TextStyle(fontWeight: FontWeight.bold, color: Color(0xFFEC4899))),
                        ),
                        title: Text(e['name'], style: const TextStyle(fontWeight: FontWeight.bold)),
                        subtitle: Text('${e['role']} · ${e['department']} · ${e['branch']}'),
                        trailing: Chip(
                          label: Text(isClockedIn ? 'Clocked in at ${e['clockTime']}' : e['status']),
                          backgroundColor: isClockedIn ? const Color(0xFFD1FAE5) : const Color(0xFFFEE2E2),
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
