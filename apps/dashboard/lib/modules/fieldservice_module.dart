import 'package:flutter/material.dart';
import '../suite.dart';
import '../widgets/record_form.dart';

class FieldServiceModuleScreen extends StatelessWidget {
  final SuiteStore store;
  const FieldServiceModuleScreen({super.key, required this.store});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Row(
          children: [
            Icon(Icons.handyman_rounded, color: Color(0xFFEA580C)),
            SizedBox(width: 10),
            Text('Field Service Management'),
          ],
        ),
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                _buildStatCard('Active Dispatches', '6 Technicians En-route', Icons.directions_run_rounded, const Color(0xFFEA580C)),
                const SizedBox(width: 16),
                _buildStatCard('SLA On-time Rate', '98.5%', Icons.timer_rounded, const Color(0xFF10B981)),
                const SizedBox(width: 16),
                _buildStatCard('Service Revenue Today', 'KES 180,000.00', Icons.payments_rounded, const Color(0xFF3B82F6)),
              ],
            ),
            const SizedBox(height: 28),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                const Text('TECHNICIAN DISPATCHES & SERVICE CALLS', style: TextStyle(fontSize: 14, fontWeight: FontWeight.bold, color: Color(0xFF64748B))),
                ElevatedButton.icon(
                  onPressed: () async {
                    final details = await recordForm(context, 'Dispatch Technician', ['Client / Site Location', 'Technician Name', 'Issue / Task Description', 'Scheduled Time']);
                    if (details != null && details[0].isNotEmpty) {
                      await store.call('saveRecord', {
                        'appId': 'fieldservice',
                        'record': {
                          'site': details[0],
                          'technician': details[1],
                          'task': details[2],
                          'time': details[3],
                          'status': 'DISPATCHED',
                        }
                      });
                    }
                  },
                  icon: const Icon(Icons.person_pin_circle_rounded, size: 16),
                  label: const Text('Add record'),
                )
              ],
            ),
            const SizedBox(height: 12),
            StreamBuilder<List<Map<String, dynamic>>>(
              stream: store.watch('field_dispatches'),
              builder: (context, snapshot) {
                final list = snapshot.data ?? [
                  {'site': 'Safaricom Tower Westlands', 'technician': 'Peter Omondi', 'task': 'Fiber Junction Repair', 'time': '2026-09-14 11:30 AM', 'status': 'EN ROUTE'},
                  {'site': 'KCB Plaza Upper Hill', 'technician': 'John Koech', 'task': 'HVAC Chiller Preventive Maintenance', 'time': '2026-09-14 02:00 PM', 'status': 'DISPATCHED'},
                ];
                return Card(
                  child: ListView.separated(
                    shrinkWrap: true,
                    physics: const NeverScrollableScrollPhysics(),
                    itemCount: list.length,
                    separatorBuilder: (context, index) => const Divider(height: 1),
                    itemBuilder: (context, idx) {
                      final item = list[idx];
                      return ListTile(
                        leading: CircleAvatar(
                          backgroundColor: const Color(0xFFEA580C).withValues(alpha: 0.1),
                          child: const Icon(Icons.handyman_rounded, color: Color(0xFFEA580C)),
                        ),
                        title: Text('${item['site']} · ${item['technician']}', style: const TextStyle(fontWeight: FontWeight.bold)),
                        subtitle: Text('Task: ${item['task']} · Scheduled: ${item['time']}'),
                        trailing: Chip(
                          label: Text(item['status'] ?? 'DISPATCHED'),
                          backgroundColor: const Color(0xFFFFEDD5),
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

  Widget _buildStatCard(String label, String value, IconData icon, Color color) {
    return Expanded(
      child: Container(
        padding: const EdgeInsets.all(20),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: const Color(0xFFE2E8F0)),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(icon, color: color, size: 28),
            const SizedBox(height: 12),
            Text(label, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.bold, color: Color(0xFF64748B))),
            const SizedBox(height: 4),
            Text(value, style: const TextStyle(fontSize: 20, fontWeight: FontWeight.bold, color: Color(0xFF0F172A))),
          ],
        ),
      ),
    );
  }
}
