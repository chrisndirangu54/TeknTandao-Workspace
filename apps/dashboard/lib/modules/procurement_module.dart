import 'package:flutter/material.dart';
import '../suite.dart';
import '../widgets/record_form.dart';

class ProcurementModuleScreen extends StatelessWidget {
  final SuiteStore store;
  const ProcurementModuleScreen({super.key, required this.store});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Row(
          children: [
            Icon(Icons.local_shipping_rounded, color: Color(0xFF2563EB)),
            SizedBox(width: 10),
            Text('Procurement & Purchasing'),
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
                _buildStatCard('Pending Purchase Orders', '5 Active POs', Icons.assignment_turned_in_rounded, const Color(0xFF2563EB)),
                const SizedBox(width: 16),
                _buildStatCard('Vendor Commitments', 'KES 1,250,000.00', Icons.account_balance_wallet_rounded, const Color(0xFF10B981)),
                const SizedBox(width: 16),
                _buildStatCard('Goods Received (GRN)', '100% Inspected', Icons.inventory_rounded, const Color(0xFF059669)),
              ],
            ),
            const SizedBox(height: 28),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                const Text('SUPPLIER PURCHASE ORDERS & RFQs', style: TextStyle(fontSize: 14, fontWeight: FontWeight.bold, color: Color(0xFF64748B))),
                ElevatedButton.icon(
                  onPressed: () async {
                    final details = await recordForm(context, 'Issue Purchase Order', ['Vendor Name', 'Item Description', 'Quantity', 'Unit Cost (KES)']);
                    if (details != null && details[0].isNotEmpty) {
                      await store.call('saveRecord', {
                        'appId': 'procurement',
                        'record': {
                          'vendor': details[0],
                          'item': details[1],
                          'qty': details[2],
                          'cost': details[3],
                          'status': 'ISSUED',
                        }
                      });
                    }
                  },
                  icon: const Icon(Icons.post_add_rounded, size: 16),
                  label: const Text('Add record'),
                )
              ],
            ),
            const SizedBox(height: 12),
            StreamBuilder<List<Map<String, dynamic>>>(
              stream: store.watch('procurement_pos'),
              builder: (context, snapshot) {
                final list = snapshot.data ?? [
                  {'poNo': 'PO-2026-088', 'vendor': 'Kenya Tea Packers Ltd', 'item': 'Premium Black Tea Bulk Bags', 'cost': '450000', 'status': 'GRN RECEIVED'},
                  {'poNo': 'PO-2026-089', 'vendor': 'Nairobi Packaging Ltd', 'item': 'Custom Thermal Paper Rolls', 'cost': '120000', 'status': 'ISSUED'},
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
                          backgroundColor: const Color(0xFF2563EB).withValues(alpha: 0.1),
                          child: const Icon(Icons.local_shipping_rounded, color: Color(0xFF2563EB)),
                        ),
                        title: Text('${item['poNo']} · ${item['vendor']}', style: const TextStyle(fontWeight: FontWeight.bold)),
                        subtitle: Text('Item: ${item['item']} · Total Value: KES ${item['cost']}'),
                        trailing: Chip(
                          label: Text(item['status'] ?? 'ISSUED'),
                          backgroundColor: const Color(0xFFDBEAFE),
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
