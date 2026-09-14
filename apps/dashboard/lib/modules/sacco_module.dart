import 'package:flutter/material.dart';
import '../suite.dart';
import '../widgets/record_form.dart';

class SaccoModuleScreen extends StatelessWidget {
  final SuiteStore store;

  const SaccoModuleScreen({super.key, required this.store});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Row(
          children: [
            Icon(Icons.account_balance_rounded, color: Color(0xFF15803D)),
            SizedBox(width: 10),
            Text('SACCO & Cooperative Financial Hub'),
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
                const Text('SACCO MEMBER SHARES & LOAN PORTFOLIO', style: TextStyle(fontSize: 14, fontWeight: FontWeight.bold, color: Color(0xFF64748B))),
                ElevatedButton.icon(
                  onPressed: () async {
                    final details = await recordForm(context, 'Register SACCO Member', ['Member Name / Group', 'Share Capital (KES)', 'Active Loan (KES)']);
                    if (details != null && details[0].isNotEmpty) {
                      final shares = double.tryParse(details[1]) ?? 0;
                      final loan = double.tryParse(details[2]) ?? 0;
                      await store.call('saveRecord', {
                        'appId': 'sacco',
                        'record': {
                          'name': details[0],
                          'sharesKes': (shares * 100).round(),
                          'activeLoanKes': (loan * 100).round(),
                          'status': 'ACTIVE',
                        }
                      });
                    }
                  },
                  icon: const Icon(Icons.group_add_rounded, size: 16),
                  label: const Text('Add Member'),
                  style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFF15803D), foregroundColor: Colors.white),
                ),
              ],
            ),
            const SizedBox(height: 16),
            StreamBuilder<List<Map<String, dynamic>>>(
              stream: store.watch('sacco_members'),
              builder: (context, snapshot) {
                if (!snapshot.hasData) return const CircularProgressIndicator();
                final members = snapshot.data!;
                return Card(
                  child: ListView.separated(
                    shrinkWrap: true,
                    physics: const NeverScrollableScrollPhysics(),
                    itemCount: members.length,
                    separatorBuilder: (context, index) => const Divider(height: 1),
                    itemBuilder: (context, idx) {
                      final m = members[idx];
                      return ListTile(
                        leading: CircleAvatar(
                          backgroundColor: const Color(0xFF15803D).withValues(alpha: 0.1),
                          child: const Icon(Icons.savings_rounded, color: Color(0xFF15803D)),
                        ),
                        title: Text(m['name'], style: const TextStyle(fontWeight: FontWeight.bold)),
                        subtitle: Text('Share Capital: ${kes(m['sharesKes'])}'),
                        trailing: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            if ((m['activeLoanKes'] as int) > 0)
                              Text('Loan: ${kes(m['activeLoanKes'])}', style: const TextStyle(fontWeight: FontWeight.bold, color: Colors.orangeAccent)),
                            const SizedBox(width: 12),
                            Chip(label: Text(m['status']), backgroundColor: const Color(0xFFDCFCE7)),
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
