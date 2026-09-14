import 'package:flutter/material.dart';
import '../suite.dart';
import '../widgets/record_form.dart';

class NgoModuleScreen extends StatelessWidget {
  final SuiteStore store;
  const NgoModuleScreen({super.key, required this.store});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Row(
          children: [
            Icon(Icons.volunteer_activism_rounded, color: Color(0xFF7E22CE)),
            SizedBox(width: 10),
            Text('NGO & Grants Management'),
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
                _buildStatCard('Active Donor Grants', 'USD \$2,400,000.00', Icons.account_balance_rounded, const Color(0xFF7E22CE)),
                const SizedBox(width: 16),
                _buildStatCard('Beneficiaries Reached', '45,200 Individuals', Icons.groups_rounded, const Color(0xFF10B981)),
                const SizedBox(width: 16),
                _buildStatCard('Audit Compliance', '100% Verified', Icons.verified_user_rounded, const Color(0xFF059669)),
              ],
            ),
            const SizedBox(height: 28),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                const Text('DONOR FUNDS & GRANT ALLOCATIONS', style: TextStyle(fontSize: 14, fontWeight: FontWeight.bold, color: Color(0xFF64748B))),
                ElevatedButton.icon(
                  onPressed: () async {
                    final details = await recordForm(context, 'Register Donor Grant', ['Grant Title', 'Donor Organization', 'Total Budget (USD)', 'Project Sector']);
                    if (details != null && details[0].isNotEmpty) {
                      await store.call('saveRecord', {
                        'appId': 'ngo',
                        'record': {
                          'title': details[0],
                          'donor': details[1],
                          'budget': details[2],
                          'sector': details[3],
                          'status': 'ACTIVE',
                        }
                      });
                    }
                  },
                  icon: const Icon(Icons.volunteer_activism_rounded, size: 16),
                  label: const Text('Add record'),
                )
              ],
            ),
            const SizedBox(height: 12),
            StreamBuilder<List<Map<String, dynamic>>>(
              stream: store.watch('grants'),
              builder: (context, snapshot) {
                final list = snapshot.data ?? [
                  {'title': 'USAID Clean Water Expansion', 'donor': 'USAID East Africa', 'budget': '\$1,500,000', 'sector': 'WASH & Community Health', 'status': 'ACTIVE'},
                  {'title': 'EU Youth Tech Empowerment', 'donor': 'European Union Fund', 'budget': '\$900,000', 'sector': 'Education & Digital Skills', 'status': 'ACTIVE'},
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
                          backgroundColor: const Color(0xFF7E22CE).withValues(alpha: 0.1),
                          child: const Icon(Icons.volunteer_activism_rounded, color: Color(0xFF7E22CE)),
                        ),
                        title: Text('${item['title']} · Donor: ${item['donor']}', style: const TextStyle(fontWeight: FontWeight.bold)),
                        subtitle: Text('Budget: ${item['budget']} · Sector: ${item['sector']}'),
                        trailing: Chip(
                          label: Text(item['status'] ?? 'ACTIVE'),
                          backgroundColor: const Color(0xFFF3E8FF),
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
