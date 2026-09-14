import 'package:flutter/material.dart';
import '../suite.dart';

class AccountingModuleScreen extends StatelessWidget {
  final SuiteStore store;

  const AccountingModuleScreen({super.key, required this.store});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Row(
          children: [
            Icon(Icons.receipt_long_rounded, color: Color(0xFF8B5CF6)),
            SizedBox(width: 10),
            Text('Books & Accounting Ledger'),
          ],
        ),
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('INVOICES & GENERAL LEDGER', style: TextStyle(fontSize: 14, fontWeight: FontWeight.bold, color: Color(0xFF64748B))),
            const SizedBox(height: 12),
            StreamBuilder<List<Map<String, dynamic>>>(
              stream: store.watch('invoices'),
              builder: (context, snapshot) {
                if (!snapshot.hasData) return const CircularProgressIndicator();
                final invoices = snapshot.data!;
                return Card(
                  child: ListView.separated(
                    shrinkWrap: true,
                    physics: const NeverScrollableScrollPhysics(),
                    itemCount: invoices.length,
                    separatorBuilder: (context, index) => const Divider(height: 1),
                    itemBuilder: (context, idx) {
                      final inv = invoices[idx];
                      final isVerified = inv['etimsStatus'] == 'VERIFIED';
                      return ListTile(
                        leading: CircleAvatar(
                          backgroundColor: const Color(0xFF8B5CF6).withValues(alpha: 0.1),
                          child: const Icon(Icons.description_rounded, color: Color(0xFF8B5CF6)),
                        ),
                        title: Text('${inv['customer']} (${inv['id']})', style: const TextStyle(fontWeight: FontWeight.bold)),
                        subtitle: Text('Due: ${inv['dueDate']} · eTIMS: ${inv['etimsStatus']}'),
                        trailing: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Text(kes(inv['amount']), style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
                            const SizedBox(width: 12),
                            Chip(
                              avatar: Icon(isVerified ? Icons.verified_rounded : Icons.pending_rounded, size: 14, color: isVerified ? const Color(0xFF059669) : Colors.amber.shade900),
                              label: Text(inv['etimsStatus'], style: const TextStyle(fontSize: 10, fontWeight: FontWeight.bold)),
                              backgroundColor: isVerified ? const Color(0xFFD1FAE5) : const Color(0xFFFEF3C7),
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
