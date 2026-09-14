import 'package:flutter/material.dart';
import '../suite.dart';
import '../widgets/record_form.dart';

class RestaurantModuleScreen extends StatelessWidget {
  final SuiteStore store;
  const RestaurantModuleScreen({super.key, required this.store});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Row(
          children: [
            Icon(Icons.restaurant_rounded, color: Color(0xFFC05621)),
            SizedBox(width: 10),
            Text('Restaurant & Bar POS'),
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
                _buildStatCard('Active Tables', '14 Seated', Icons.table_restaurant_rounded, const Color(0xFFC05621)),
                const SizedBox(width: 16),
                _buildStatCard('Kitchen Orders (KDS)', '5 Active Tickets', Icons.outdoor_grill_rounded, const Color(0xFFEA580C)),
                const SizedBox(width: 16),
                _buildStatCard('Shift Sales Volume', 'KES 420,000.00', Icons.payments_rounded, const Color(0xFF10B981)),
              ],
            ),
            const SizedBox(height: 28),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                const Text('TABLE LAYOUT & KITCHEN DISPLAY SYSTEM', style: TextStyle(fontSize: 14, fontWeight: FontWeight.bold, color: Color(0xFF64748B))),
                ElevatedButton.icon(
                  onPressed: () async {
                    final details = await recordForm(context, 'Send Order to Kitchen', ['Table Number', 'Order Dishes & Drinks', 'Waiter Name', 'Total Bill (KES)']);
                    if (details != null && details[0].isNotEmpty) {
                      await store.call('saveRecord', {
                        'appId': 'restaurant',
                        'record': {
                          'table': details[0],
                          'dishes': details[1],
                          'waiter': details[2],
                          'bill': details[3],
                          'status': 'PREPARING',
                        }
                      });
                    }
                  },
                  icon: const Icon(Icons.soup_kitchen_rounded, size: 16),
                  label: const Text('Add record'),
                )
              ],
            ),
            const SizedBox(height: 12),
            StreamBuilder<List<Map<String, dynamic>>>(
              stream: store.watch('restaurant_orders'),
              builder: (context, snapshot) {
                final list = snapshot.data ?? [
                  {'table': 'Table 08', 'dishes': '2x Grilled Tilapia, 1x Swahili Rice, 2x Fresh Juice', 'waiter': 'Kevin Otieno', 'bill': '4800', 'status': 'PREPARING'},
                  {'table': 'Table 14', 'dishes': '4x Nyama Choma Platter, 4x Tusker Lager', 'waiter': 'Wanjiru N.', 'bill': '12500', 'status': 'SERVED'},
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
                          backgroundColor: const Color(0xFFC05621).withValues(alpha: 0.1),
                          child: const Icon(Icons.restaurant_rounded, color: Color(0xFFC05621)),
                        ),
                        title: Text('${item['table']} · Waiter: ${item['waiter']}', style: const TextStyle(fontWeight: FontWeight.bold)),
                        subtitle: Text('${item['dishes']} · Bill: KES ${item['bill']}'),
                        trailing: Chip(
                          label: Text(item['status'] ?? 'PREPARING'),
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
