import 'package:flutter/material.dart';
import '../suite.dart';
import '../widgets/record_form.dart';

class ManufacturingModuleScreen extends StatelessWidget {
  final SuiteStore store;
  const ManufacturingModuleScreen({super.key, required this.store});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Row(
          children: [
            Icon(Icons.precision_manufacturing_rounded, color: Color(0xFF4B5563)),
            SizedBox(width: 10),
            Text('Manufacturing & MRP'),
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
                _buildStatCard('Active Work Orders', '4 Assembly Lines', Icons.build_rounded, const Color(0xFF4B5563)),
                const SizedBox(width: 16),
                _buildStatCard('Finished SKUs Yield', '1,450 Units Today', Icons.check_circle_rounded, const Color(0xFF10B981)),
                const SizedBox(width: 16),
                _buildStatCard('Material Costing', 'KES 850.00 / Unit', Icons.calculate_rounded, const Color(0xFFF59E0B)),
              ],
            ),
            const SizedBox(height: 28),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                const Text('BILL OF MATERIALS (BOM) & WORK ORDERS', style: TextStyle(fontSize: 14, fontWeight: FontWeight.bold, color: Color(0xFF64748B))),
                ElevatedButton.icon(
                  onPressed: () async {
                    final details = await recordForm(context, 'Create Work Order', ['Finished Item Name', 'Target Quantity', 'BOM Recipe Code', 'Assembly Station']);
                    if (details != null && details[0].isNotEmpty) {
                      await store.call('saveRecord', {
                        'appId': 'manufacturing',
                        'record': {
                          'item': details[0],
                          'qty': details[1],
                          'bomCode': details[2],
                          'station': details[3],
                          'status': 'IN_PROGRESS',
                        }
                      });
                    }
                  },
                  icon: const Icon(Icons.playlist_add_rounded, size: 16),
                  label: const Text('Add record'),
                )
              ],
            ),
            const SizedBox(height: 12),
            StreamBuilder<List<Map<String, dynamic>>>(
              stream: store.watch('work_orders'),
              builder: (context, snapshot) {
                final list = snapshot.data ?? [
                  {'woNo': 'WO-8801', 'item': '500g Packaged Blend Coffee', 'qty': '1000 Units', 'station': 'Line 2 Packaging', 'status': 'IN_PROGRESS'},
                  {'woNo': 'WO-8802', 'item': '200ml Flavored Milk Pouch', 'qty': '5000 Units', 'station': 'Pasteurization Line 1', 'status': 'COMPLETED'},
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
                          backgroundColor: const Color(0xFF4B5563).withValues(alpha: 0.1),
                          child: const Icon(Icons.precision_manufacturing_rounded, color: Color(0xFF4B5563)),
                        ),
                        title: Text('${item['woNo']} · ${item['item']}', style: const TextStyle(fontWeight: FontWeight.bold)),
                        subtitle: Text('Quantity: ${item['qty']} · Station: ${item['station']}'),
                        trailing: Chip(
                          label: Text(item['status'] ?? 'IN_PROGRESS'),
                          backgroundColor: const Color(0xFFE5E7EB),
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
