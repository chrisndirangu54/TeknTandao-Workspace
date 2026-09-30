import 'package:flutter/material.dart';
import '../suite.dart';

class EtimsModuleScreen extends StatelessWidget {
  final SuiteStore store;

  const EtimsModuleScreen({super.key, required this.store});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Row(
          children: [
            Icon(Icons.verified_user_rounded, color: Color(0xFF059669)),
            SizedBox(width: 10),
            Text('Kenya KRA eTIMS'),
          ],
        ),
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Status Header Banner
            Container(
              padding: const EdgeInsets.all(20),
              decoration: BoxDecoration(
                color: const Color(0xFF78350F),
                borderRadius: BorderRadius.circular(16),
              ),
              child: const Row(
                children: [
                  Icon(Icons.gpp_maybe_rounded, color: Color(0xFFFBBF24), size: 36),
                  SizedBox(width: 16),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('eTIMS is not certified', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 18)),
                        SizedBox(height: 4),
                        Text('Submissions stay blocked until a KRA OSCU credential is configured. Preview sales do not receive a control code.', style: TextStyle(color: Colors.white70, fontSize: 12)),
                      ],
                    ),
                  ),
                ],
              ),
            ),

            const SizedBox(height: 24),
            const Text('RECENT eTIMS TAX SUBMISSIONS LOG (AUDIT TRAIL)', style: TextStyle(fontSize: 14, fontWeight: FontWeight.bold, color: Color(0xFF64748B))),
            const SizedBox(height: 12),

            StreamBuilder<List<Map<String, dynamic>>>(
              stream: store.watch('etims_logs'),
              builder: (context, snapshot) {
                if (!snapshot.hasData) return const CircularProgressIndicator();
                final logs = snapshot.data!;
                return Card(
                  child: ListView.separated(
                    shrinkWrap: true,
                    physics: const NeverScrollableScrollPhysics(),
                    itemCount: logs.length,
                    separatorBuilder: (context, index) => const Divider(height: 1),
                    itemBuilder: (context, idx) {
                      final l = logs[idx];
                      final isVerified = l['status'] == 'VERIFIED';
                      return ListTile(
                        leading: CircleAvatar(
                          backgroundColor: const Color(0xFF059669).withValues(alpha: 0.1),
                          child: const Icon(Icons.qr_code_rounded, color: Color(0xFF059669)),
                        ),
                        title: Text(isVerified ? 'Control Code: ${l['controlCode']}' : 'Not submitted · ${l['controlCode']}', style: const TextStyle(fontWeight: FontWeight.bold)),
                        subtitle: Text(isVerified ? 'Invoice: ${l['invoiceNo']} · VAT Collected: ${kes(l['vatAmount'])} · ${l['timestamp']}' : 'Invoice: ${l['invoiceNo']} · No KRA submission · ${l['timestamp']}'),
                        trailing: Chip(
                          avatar: Icon(isVerified ? Icons.check_circle : Icons.sync, size: 14, color: isVerified ? Colors.white : Colors.black),
                          label: Text(l['status'], style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 10)),
                          backgroundColor: isVerified ? const Color(0xFF059669) : Colors.amber,
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
