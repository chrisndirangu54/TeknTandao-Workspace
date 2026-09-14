import 'package:flutter/material.dart';
import '../suite.dart';
import '../widgets/record_form.dart';

class PropertyModuleScreen extends StatelessWidget {
  final SuiteStore store;

  const PropertyModuleScreen({super.key, required this.store});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Row(
          children: [
            Icon(Icons.apartment_rounded, color: Color(0xFF0D9488)),
            SizedBox(width: 10),
            Text('Property & Real Estate Management'),
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
                const Text('TENANT LEASES & RENTAL UNITS', style: TextStyle(fontSize: 14, fontWeight: FontWeight.bold, color: Color(0xFF64748B))),
                ElevatedButton.icon(
                  onPressed: () async {
                    final details = await recordForm(context, 'Register Property Unit', ['Property Name / Unit', 'Tenant Name', 'Monthly Rent (KES)']);
                    if (details != null && details[0].isNotEmpty) {
                      final rent = double.tryParse(details[2]) ?? 0;
                      await store.call('saveRecord', {
                        'appId': 'property',
                        'record': {
                          'name': details[0],
                          'tenant': details[1],
                          'rentKes': (rent * 100).round(),
                          'status': 'OCCUPIED',
                        }
                      });
                    }
                  },
                  icon: const Icon(Icons.add_home_work_rounded, size: 16),
                  label: const Text('Add Property Unit'),
                  style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFF0D9488), foregroundColor: Colors.white),
                ),
              ],
            ),
            const SizedBox(height: 16),
            StreamBuilder<List<Map<String, dynamic>>>(
              stream: store.watch('properties'),
              builder: (context, snapshot) {
                if (!snapshot.hasData) return const CircularProgressIndicator();
                final properties = snapshot.data!;
                return Card(
                  child: ListView.separated(
                    shrinkWrap: true,
                    physics: const NeverScrollableScrollPhysics(),
                    itemCount: properties.length,
                    separatorBuilder: (context, index) => const Divider(height: 1),
                    itemBuilder: (context, idx) {
                      final p = properties[idx];
                      return ListTile(
                        leading: CircleAvatar(
                          backgroundColor: const Color(0xFF0D9488).withValues(alpha: 0.1),
                          child: const Icon(Icons.location_city_rounded, color: Color(0xFF0D9488)),
                        ),
                        title: Text(p['name'], style: const TextStyle(fontWeight: FontWeight.bold)),
                        subtitle: Text('Tenant: ${p['tenant']}'),
                        trailing: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Text('${kes(p['rentKes'])}/mo', style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 15)),
                            const SizedBox(width: 12),
                            Chip(label: Text(p['status']), backgroundColor: const Color(0xFFCCFBF1)),
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
