import 'package:flutter/material.dart';
import '../suite.dart';
import '../widgets/record_form.dart';

class FleetModuleScreen extends StatelessWidget {
  final SuiteStore store;
  const FleetModuleScreen({super.key, required this.store});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Row(
          children: [
            Icon(Icons.directions_car_rounded, color: Color(0xFF0369A1)),
            SizedBox(width: 10),
            Text('Fleet & Vehicle Logistics'),
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
                _buildStatCard('Active Fleet Vehicles', '18 Trucks Active', Icons.local_shipping_rounded, const Color(0xFF0369A1)),
                const SizedBox(width: 16),
                _buildStatCard('Fuel Consumption Today', '420 Liters', Icons.local_gas_station_rounded, const Color(0xFFF59E0B)),
                const SizedBox(width: 16),
                _buildStatCard('Trips Completed', '14 Delivery Routes', Icons.route_rounded, const Color(0xFF10B981)),
              ],
            ),
            const SizedBox(height: 28),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                const Text('VEHICLE DISPATCH & ROUTE LOGS', style: TextStyle(fontSize: 14, fontWeight: FontWeight.bold, color: Color(0xFF64748B))),
                ElevatedButton.icon(
                  onPressed: () async {
                    final details = await recordForm(context, 'Dispatch Trip', ['Vehicle Registration Number', 'Driver Name', 'Route / Destination', 'Fuel Allocated (Liters)']);
                    if (details != null && details[0].isNotEmpty) {
                      await store.call('saveRecord', {
                        'appId': 'fleet',
                        'record': {
                          'rego': details[0],
                          'driver': details[1],
                          'route': details[2],
                          'fuel': details[3],
                          'status': 'IN_TRANSIT',
                        }
                      });
                    }
                  },
                  icon: const Icon(Icons.add_road_rounded, size: 16),
                  label: const Text('Add record'),
                )
              ],
            ),
            const SizedBox(height: 12),
            StreamBuilder<List<Map<String, dynamic>>>(
              stream: store.watch('fleet_trips'),
              builder: (context, snapshot) {
                final list = snapshot.data ?? [
                  {'rego': 'KDA 492X', 'driver': 'Samuel Mutua', 'route': 'Nairobi - Mombasa Highway', 'fuel': '180L', 'status': 'IN_TRANSIT'},
                  {'rego': 'KCF 102Z', 'driver': 'David Kibet', 'route': 'Nakuru - Eldoret Express', 'fuel': '90L', 'status': 'ARRIVED'},
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
                          backgroundColor: const Color(0xFF0369A1).withValues(alpha: 0.1),
                          child: const Icon(Icons.directions_car_rounded, color: Color(0xFF0369A1)),
                        ),
                        title: Text('${item['rego']} · ${item['driver']}', style: const TextStyle(fontWeight: FontWeight.bold)),
                        subtitle: Text('Route: ${item['route']} · Fuel Tank: ${item['fuel']}'),
                        trailing: Chip(
                          label: Text(item['status'] ?? 'IN_TRANSIT'),
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
