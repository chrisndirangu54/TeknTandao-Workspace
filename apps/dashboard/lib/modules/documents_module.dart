import 'package:flutter/material.dart';
import '../suite.dart';
import '../widgets/record_form.dart';

class DocumentsModuleScreen extends StatelessWidget {
  final SuiteStore store;
  const DocumentsModuleScreen({super.key, required this.store});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Row(
          children: [
            Icon(Icons.drive_file_rename_outline_rounded, color: Color(0xFF059669)),
            SizedBox(width: 10),
            Text('WorkDrive & Digital Signatures'),
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
                _buildStatCard('Cloud Storage Vault', '142.8 GB / 1 TB', Icons.cloud_done_rounded, const Color(0xFF059669)),
                const SizedBox(width: 16),
                _buildStatCard('Legal e-Signatures', '28 Signed Documents', Icons.draw_rounded, const Color(0xFF3B82F6)),
                const SizedBox(width: 16),
                _buildStatCard('Encrypted Encryption', 'AES-256 Bit', Icons.lock_rounded, const Color(0xFF0F172A)),
              ],
            ),
            const SizedBox(height: 28),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                const Text('ORGANIZATION DOCUMENTS & CONTRACT E-SIGN', style: TextStyle(fontSize: 14, fontWeight: FontWeight.bold, color: Color(0xFF64748B))),
                ElevatedButton.icon(
                  onPressed: () async {
                    final details = await recordForm(context, 'Upload Document', ['Document Title', 'Folder Category', 'Required Signer Email', 'Security Classification']);
                    if (details != null && details[0].isNotEmpty) {
                      await store.call('saveRecord', {
                        'appId': 'documents',
                        'record': {
                          'title': details[0],
                          'category': details[1],
                          'signer': details[2],
                          'security': details[3],
                          'status': 'SIGNED',
                        }
                      });
                    }
                  },
                  icon: const Icon(Icons.upload_file_rounded, size: 16),
                  label: const Text('Add record'),
                )
              ],
            ),
            const SizedBox(height: 12),
            StreamBuilder<List<Map<String, dynamic>>>(
              stream: store.watch('documents'),
              builder: (context, snapshot) {
                final list = snapshot.data ?? [
                  {'title': 'Vendor Service Agreement 2026.pdf', 'category': 'Legal & Contracts', 'signer': 'ceo@tekntandao.co.ke', 'security': 'CONFIDENTIAL', 'status': 'SIGNED'},
                  {'title': 'KRA eTIMS Tax Compliance Certificate.pdf', 'category': 'Tax & Regulatory', 'signer': 'N/A', 'security': 'PUBLIC', 'status': 'VERIFIED'},
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
                          backgroundColor: const Color(0xFF059669).withValues(alpha: 0.1),
                          child: const Icon(Icons.insert_drive_file_rounded, color: Color(0xFF059669)),
                        ),
                        title: Text(item['title'], style: const TextStyle(fontWeight: FontWeight.bold)),
                        subtitle: Text('Category: ${item['category']} · Signer: ${item['signer']}'),
                        trailing: Chip(
                          label: Text(item['status'] ?? 'SIGNED'),
                          backgroundColor: const Color(0xFFD1FAE5),
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
