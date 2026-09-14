import 'package:flutter/material.dart';
import '../suite.dart';
import '../widgets/record_form.dart';

class HotelModuleScreen extends StatelessWidget {
  final SuiteStore store;
  const HotelModuleScreen({super.key, required this.store});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Row(
          children: [
            Icon(Icons.hotel_rounded, color: Color(0xFFBE185D)),
            SizedBox(width: 10),
            Text('Hotel & Hospitality'),
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
                _buildStatCard('Room Occupancy Rate', '85% Occupied', Icons.hotel_rounded, const Color(0xFFBE185D)),
                const SizedBox(width: 16),
                _buildStatCard('Guest Folios Today', 'KES 1,450,000.00', Icons.payments_rounded, const Color(0xFF10B981)),
                const SizedBox(width: 16),
                _buildStatCard('Check-ins Scheduled', '12 Guests', Icons.meeting_room_rounded, const Color(0xFF3B82F6)),
              ],
            ),
            const SizedBox(height: 28),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                const Text('ROOM RESERVATIONS & GUEST CHECK-IN', style: TextStyle(fontSize: 14, fontWeight: FontWeight.bold, color: Color(0xFF64748B))),
                ElevatedButton.icon(
                  onPressed: () async {
                    final details = await recordForm(context, 'New Reservation', ['Guest Full Name', 'Room Suite Number', 'Check-In / Out Dates', 'Folio Amount (KES)']);
                    if (details != null && details[0].isNotEmpty) {
                      await store.call('saveRecord', {
                        'appId': 'hotel',
                        'record': {
                          'guest': details[0],
                          'room': details[1],
                          'dates': details[2],
                          'folio': details[3],
                          'status': 'CHECKED_IN',
                        }
                      });
                    }
                  },
                  icon: const Icon(Icons.key_rounded, size: 16),
                  label: const Text('Add record'),
                )
              ],
            ),
            const SizedBox(height: 12),
            StreamBuilder<List<Map<String, dynamic>>>(
              stream: store.watch('hotel_rooms'),
              builder: (context, snapshot) {
                final list = snapshot.data ?? [
                  {'guest': 'Dr. Amina Hassan', 'room': 'Executive Suite 402', 'dates': '14 Sep - 18 Sep', 'folio': '180000', 'status': 'CHECKED_IN'},
                  {'guest': 'Marcus Vance', 'room': 'Deluxe Ocean View 204', 'dates': '14 Sep - 16 Sep', 'folio': '95000', 'status': 'RESERVED'},
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
                          backgroundColor: const Color(0xFFBE185D).withValues(alpha: 0.1),
                          child: const Icon(Icons.hotel_rounded, color: Color(0xFFBE185D)),
                        ),
                        title: Text('${item['room']} · ${item['guest']}', style: const TextStyle(fontWeight: FontWeight.bold)),
                        subtitle: Text('Dates: ${item['dates']} · Folio: KES ${item['folio']}'),
                        trailing: Chip(
                          label: Text(item['status'] ?? 'CHECKED_IN'),
                          backgroundColor: const Color(0xFFFCE7F3),
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
