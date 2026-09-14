import 'package:flutter/material.dart';
import '../suite.dart';
import '../widgets/record_form.dart';

class EcommerceModuleScreen extends StatelessWidget {
  final SuiteStore store;
  const EcommerceModuleScreen({super.key, required this.store});

  Future<void> _createOrder(BuildContext context) async {
    final details = await recordForm(
      context,
      'Create Online Order',
      [
        'Customer Name',
        'Items / SKUs',
        'Order Total (KES)',
        'Payment Method',
      ],
    );
    if (details == null || details[0].trim().isEmpty) return;
    await store.call('saveRecord', {
      'appId': 'ecommerce',
      'record': {
        'orderId': 'WEB-${DateTime.now().millisecondsSinceEpoch}',
        'customer': details[0].trim(),
        'items': details[1].trim(),
        'total': details[2].trim(),
        'payment': details[3].trim(),
        'status': 'PROCESSING',
      },
    });
  }

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
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => _createOrder(context),
        icon: const Icon(Icons.add_shopping_cart_rounded),
        label: const Text('New order'),
      ),
      body: StreamBuilder<List<Map<String, dynamic>>>(
        stream: store.watch('ecommerce_orders'),
        builder: (context, snapshot) {
          if (snapshot.connectionState == ConnectionState.waiting &&
              !snapshot.hasData) {
            return const Center(child: CircularProgressIndicator());
          }
          if (snapshot.hasError) {
            return Center(
              child: Text('Unable to load online orders: ${snapshot.error}'),
            );
          }

          final orders = snapshot.data ?? const <Map<String, dynamic>>[];
          final grossValue = orders.fold<double>(0, (sum, order) {
            final raw = order['total'];
            if (raw is num) return sum + raw.toDouble();
            return sum +
                (double.tryParse(raw?.toString().replaceAll(',', '') ?? '') ??
                    0);
          });
          final paid = orders
              .where((order) =>
                  (order['status']?.toString().toUpperCase() ?? '')
                      .contains('PAID'))
              .length;
          final processing = orders
              .where((order) =>
                  (order['status']?.toString().toUpperCase() ?? '')
                      .contains('PROCESS'))
              .length;

          return SingleChildScrollView(
            padding: const EdgeInsets.fromLTRB(24, 24, 24, 96),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Wrap(
                  spacing: 16,
                  runSpacing: 16,
                  children: [
                    _buildStatCard(
                      'Online GMV',
                      'KES ${grossValue.toStringAsFixed(2)}',
                      Icons.storefront_rounded,
                      const Color(0xFFD97706),
                    ),
                    _buildStatCard(
                      'Orders',
                      '${orders.length}',
                      Icons.shopping_cart_rounded,
                      const Color(0xFF10B981),
                    ),
                    _buildStatCard(
                      'Paid',
                      '$paid',
                      Icons.payments_rounded,
                      const Color(0xFF16A34A),
                    ),
                    _buildStatCard(
                      'Processing',
                      '$processing',
                      Icons.local_shipping_outlined,
                      const Color(0xFF2563EB),
                    ),
                  ],
                ),
                const SizedBox(height: 28),
                const Text(
                  'ONLINE STORE ORDERS & DISPATCH',
                  style: TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.bold,
                    color: Color(0xFF64748B),
                  ),
                ),
                const SizedBox(height: 12),
                if (orders.isEmpty)
                  const Card(
                    child: Padding(
                      padding: EdgeInsets.all(28),
                      child: Text(
                        'No online orders yet. Create an order or connect the storefront checkout workflow.',
                      ),
                    ),
                  )
                else
                  Card(
                    child: ListView.separated(
                      shrinkWrap: true,
                      physics: const NeverScrollableScrollPhysics(),
                      itemCount: orders.length,
                      separatorBuilder: (_, _) => const Divider(height: 1),
                      itemBuilder: (context, index) {
                        final item = orders[index];
                        return ListTile(
                          leading: CircleAvatar(
                            backgroundColor: const Color(0xFFD97706)
                                .withValues(alpha: 0.1),
                            child: const Icon(
                              Icons.shopping_bag_rounded,
                              color: Color(0xFFD97706),
                            ),
                          ),
                          title: Text(
                            '${item['orderId'] ?? item['id'] ?? 'Order'} · ${item['customer'] ?? 'Customer'}',
                            style: const TextStyle(fontWeight: FontWeight.bold),
                          ),
                          subtitle: Text(
                            '${item['items'] ?? ''} · Payment: ${item['payment'] ?? 'Pending'} · Total: KES ${item['total'] ?? '0'}',
                          ),
                          trailing: Chip(
                            label: Text(item['status']?.toString() ?? 'PROCESSING'),
                          ),
                        );
                      },
                    ),
                  ),
              ],
            ),
          );
        },
      ),
    );
  }

  Widget _buildStatCard(
    String label,
    String value,
    IconData icon,
    Color color,
  ) {
    return SizedBox(
      width: 240,
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
            Text(
              label,
              style: const TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.bold,
                color: Color(0xFF64748B),
              ),
            ),
            const SizedBox(height: 4),
            Text(
              value,
              style: const TextStyle(
                fontSize: 20,
                fontWeight: FontWeight.bold,
                color: Color(0xFF0F172A),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
