import 'package:flutter/material.dart';
import '../suite.dart';
import '../widgets/record_form.dart';

class EcommerceModuleScreen extends StatelessWidget {
  final SuiteStore store;
  const EcommerceModuleScreen({super.key, required this.store});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Row(
          children: [
            Icon(Icons.shopping_bag_rounded, color: Color(0xFFD97706)),
            SizedBox(width: 10),
            Text('E-Commerce Storefront'),
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
                _buildStatCard('Online GMV Today', 'KES 340,000.00', Icons.storefront_rounded, const Color(0xFFD97706)),
                const SizedBox(width: 16),
                _buildStatCard('Web Cart Conversion', '4.8%', Icons.shopping_cart_rounded, const Color(0xFF10B981)),
                const SizedBox(width: 16),
                _buildStatCard('M-Pesa Express Checkout', '100% Instant', Icons.bolt_rounded, const Color(0xFF16A34A)),
              ],
            ),
            const SizedBox(height: 28),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                const Text('ONLINE STORE ORDERS & DISPATCH', style: TextStyle(fontSize: 14, fontWeight: FontWeight.bold, color: Color(0xFF64748B))),
                ElevatedButton.icon(
                  onPressed: () async {
                    final details = await recordForm(context, 'New Store Product', ['Product Title', 'Online Price (KES)', 'SKU Category', 'Stock Quantity']);
                    if (details != null && details[0].isNotEmpty) {
                      await store.call('saveRecord', {
                        'appId': 'ecommerce',
                        'record': {
                          'title': details[0],
                          'price': details[1],
                          'category': details[2],
                          'stock': details[3],
                          'status': 'PUBLISHED',
                        }
                      });
                    }
                  },
                  icon: const Icon(Icons.add_shopping_cart_rounded, size: 16),
                  label: const Text('Add record'),
                )
              ],
            ),
            const SizedBox(height: 12),
            StreamBuilder<List<Map<String, dynamic>>>(
              stream: store.watch('ecommerce_orders'),
              builder: (context, snapshot) {
                final list = snapshot.data ?? [
                  {'orderId': 'ORD-2026-901', 'customer': 'Maina Kamau', 'items': '2x Solar Inverter 5kW', 'total': '280000', 'payment': 'M-Pesa STK', 'status': 'PAID & DISPATCHED'},
                  {'orderId': 'ORD-2026-902', 'customer': 'Grace Omondi', 'items': '1x Smart POS Terminal', 'total': '60000', 'payment': 'Paystack Card', 'status': 'PROCESSING'},
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
                          backgroundColor: const Color(0xFFD97706).withValues(alpha: 0.1),
                          child: const Icon(Icons.shopping_bag_rounded, color: Color(0xFFD97706)),
                        ),
                        title: Text('${item['orderId']} · ${item['customer']}', style: const TextStyle(fontWeight: FontWeight.bold)),
                        subtitle: Text('${item['items']} · Payment: ${item['payment']} · Total: KES ${item['total']}'),
                        trailing: Chip(
                          label: Text(item['status'] ?? 'PAID'),
                          backgroundColor: const Color(0xFFFEF3C7),
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
