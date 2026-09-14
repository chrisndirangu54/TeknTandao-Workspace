import 'package:flutter/material.dart';
import '../suite.dart';
import '../widgets/record_form.dart';

class BookingsModuleScreen extends StatelessWidget {
  final SuiteStore store;
  const BookingsModuleScreen({super.key, required this.store});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Row(
          children: [
            Icon(Icons.calendar_month_rounded, color: Color(0xFF0284C7)),
            SizedBox(width: 10),
            Text('Bookings & Scheduling'),
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
                _buildStatCard('Today Appointments', '8 Scheduled', Icons.today_rounded, const Color(0xFF0284C7)),
                const SizedBox(width: 16),
                _buildStatCard('Pending Deposit', 'KES 45,000.00', Icons.payments_rounded, const Color(0xFF10B981)),
                const SizedBox(width: 16),
                _buildStatCard('SMS Reminders Sent', '24 Sent', Icons.sms_rounded, const Color(0xFF805AD5)),
              ],
            ),
            const SizedBox(height: 28),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                const Text('CLIENT APPOINTMENTS & RESERVATIONS', style: TextStyle(fontSize: 14, fontWeight: FontWeight.bold, color: Color(0xFF64748B))),
                ElevatedButton.icon(
                  onPressed: () async {
                    final details = await recordForm(context, 'Book Appointment', ['Client Name', 'Service Required', 'Date & Time', 'Deposit Paid (KES)']);
                    if (details != null && details[0].isNotEmpty) {
                      await store.call('saveRecord', {
                        'appId': 'bookings',
                        'record': {
                          'client': details[0],
                          'service': details[1],
                          'datetime': details[2],
                          'deposit': details[3],
                          'status': 'CONFIRMED',
                        }
                      });
                    }
                  },
                  icon: const Icon(Icons.add_task_rounded, size: 16),
                  label: const Text('Add record'),
                )
              ],
            ),
            const SizedBox(height: 12),
            StreamBuilder<List<Map<String, dynamic>>>(
              stream: store.watch('appointments'),
              builder: (context, snapshot) {
                final list = snapshot.data ?? [
                  {'client': 'Dr. Njuguna Consulting', 'service': 'Executive Tax Audit', 'datetime': '2026-09-15 10:00 AM', 'deposit': '15000', 'status': 'CONFIRMED'},
                  {'client': 'Sarah Akello', 'service': 'Legal Retainer Brief', 'datetime': '2026-09-15 02:30 PM', 'deposit': '30000', 'status': 'PENDING'},
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
                          backgroundColor: const Color(0xFF0284C7).withValues(alpha: 0.1),
                          child: const Icon(Icons.calendar_month_rounded, color: Color(0xFF0284C7)),
                        ),
                        title: Text(item['client'], style: const TextStyle(fontWeight: FontWeight.bold)),
                        subtitle: Text('Service: ${item['service']} · Time: ${item['datetime']} · Deposit: KES ${item['deposit']}'),
                        trailing: Chip(
                          label: Text(item['status'] ?? 'CONFIRMED'),
                          backgroundColor: const Color(0xFFE0F2FE),
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
