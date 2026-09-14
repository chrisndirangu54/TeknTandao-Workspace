import 'package:flutter/material.dart';
import '../suite.dart';
import '../widgets/record_form.dart';

class MarketingModuleScreen extends StatelessWidget {
  final SuiteStore store;

  const MarketingModuleScreen({super.key, required this.store});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Row(
          children: [
            Icon(Icons.campaign_rounded, color: Color(0xFF805AD5)),
            SizedBox(width: 10),
            Text('Marketing Automation Hub'),
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
                _buildStatCard('Active Campaigns', '12 Launched', Icons.mark_email_read_rounded, const Color(0xFF805AD5)),
                const SizedBox(width: 16),
                _buildStatCard('WhatsApp Open Rate', '94.2%', Icons.chat_rounded, const Color(0xFF25D366)),
                const SizedBox(width: 16),
                _buildStatCard('Leads Generated', '482 Leads', Icons.trending_up_rounded, const Color(0xFF3B82F6)),
              ],
            ),
            const SizedBox(height: 28),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                const Text('CAMPAIGNS & WHATSAPP JOURNEYS', style: TextStyle(fontSize: 14, fontWeight: FontWeight.bold, color: Color(0xFF64748B))),
                ElevatedButton.icon(
                  onPressed: () async {
                    final details = await recordForm(context, 'Launch Campaign', ['Campaign Name', 'Target Segment', 'Message Template', 'Channel (Email/WhatsApp/SMS)']);
                    if (details != null && details[0].isNotEmpty) {
                      await store.call('saveRecord', {
                        'appId': 'marketing',
                        'record': {
                          'name': details[0],
                          'segment': details[1],
                          'template': details[2],
                          'channel': details[3],
                          'status': 'ACTIVE',
                          'sentCount': 1500,
                        }
                      });
                    }
                  },
                  icon: const Icon(Icons.send_rounded, size: 16),
                  label: const Text('Add record'),
                )
              ],
            ),
            const SizedBox(height: 12),
            StreamBuilder<List<Map<String, dynamic>>>(
              stream: store.watch('marketing_campaigns'),
              builder: (context, snapshot) {
                final list = snapshot.data ?? [
                  {'name': 'Q3 East Africa Promo', 'segment': 'SME Retailers', 'channel': 'WhatsApp Bulk', 'sentCount': 4200, 'status': 'ACTIVE'},
                  {'name': 'eTIMS Compliance Reminder', 'segment': 'Kenya Enterprise', 'channel': 'SMS & Email', 'sentCount': 1850, 'status': 'COMPLETED'},
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
                          backgroundColor: const Color(0xFF805AD5).withValues(alpha: 0.1),
                          child: const Icon(Icons.campaign_rounded, color: Color(0xFF805AD5)),
                        ),
                        title: Text(item['name'], style: const TextStyle(fontWeight: FontWeight.bold)),
                        subtitle: Text('Segment: ${item['segment']} · Channel: ${item['channel']} · Sent: ${item['sentCount']}'),
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
