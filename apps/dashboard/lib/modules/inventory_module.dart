import 'package:flutter/material.dart';
import '../suite.dart';
import '../widgets/record_form.dart';

class InventoryModuleScreen extends StatelessWidget {
  final SuiteStore store;

  const InventoryModuleScreen({super.key, required this.store});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Row(
          children: [
            Icon(Icons.inventory_2_rounded, color: Color(0xFFF59E0B)),
            SizedBox(width: 10),
            Text('Inventory & Warehouse Management'),
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
                const Text('CANONICAL PRODUCT REGISTER & STOCK LEVELS', style: TextStyle(fontSize: 14, fontWeight: FontWeight.bold, color: Color(0xFF64748B))),
                ElevatedButton.icon(
                  onPressed: () async {
                    final details = await recordForm(context, 'Add New Product SKU', ['Product Name', 'SKU Code', 'Price in KES', 'Initial Stock', 'Warehouse']);
                    if (details != null && details[0].isNotEmpty) {
                      final price = double.tryParse(details[2]) ?? 0;
                      final stock = int.tryParse(details[3]) ?? 0;
                      await store.call('saveRecord', {
                        'appId': 'inventory',
                        'record': {
                          'name': details[0],
                          'sku': details[1],
                          'price': (price * 100).round(),
                          'stock': stock,
                          'warehouse': details[4].isEmpty ? 'Nairobi Main' : details[4],
                          'category': 'General Product',
                        }
                      });
                    }
                  },
                  icon: const Icon(Icons.add_box_rounded, size: 16),
                  label: const Text('Add SKU Item'),
                  style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFFF59E0B), foregroundColor: Colors.white),
                ),
              ],
            ),
            const SizedBox(height: 16),
            StreamBuilder<List<Map<String, dynamic>>>(
              stream: store.watch('products'),
              builder: (context, snapshot) {
                if (!snapshot.hasData) return const CircularProgressIndicator();
                final products = snapshot.data!;
                return Card(
                  child: ListView.separated(
                    shrinkWrap: true,
                    physics: const NeverScrollableScrollPhysics(),
                    itemCount: products.length,
                    separatorBuilder: (context, index) => const Divider(height: 1),
                    itemBuilder: (context, idx) {
                      final p = products[idx];
                      final stock = p['stock'] as int;
                      final isLow = stock <= 5;
                      return ListTile(
                        leading: Container(
                          padding: const EdgeInsets.all(8),
                          decoration: BoxDecoration(color: const Color(0xFFFEF3C7), borderRadius: BorderRadius.circular(8)),
                          child: const Icon(Icons.inventory_rounded, color: Color(0xFFD97706)),
                        ),
                        title: Text(p['name'], style: const TextStyle(fontWeight: FontWeight.bold)),
                        subtitle: Text('SKU: ${p['sku']} · Warehouse: ${p['warehouse']} · Category: ${p['category']}'),
                        trailing: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Text(kes(p['price']), style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 15)),
                            const SizedBox(width: 16),
                            Chip(
                              label: Text('$stock units', style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 11)),
                              backgroundColor: isLow ? Colors.amber.shade100 : const Color(0xFFD1FAE5),
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
