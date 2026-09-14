import 'package:flutter/material.dart';
import '../suite.dart';
import '../widgets/record_form.dart';

class HelpdeskModuleScreen extends StatelessWidget {
  final SuiteStore store;

  const HelpdeskModuleScreen({super.key, required this.store});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Row(
          children: [
            Icon(Icons.support_agent_rounded, color: Color(0xFF0284C7)),
            SizedBox(width: 10),
            Text('Customer Desk & Support Tickets'),
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
                const Text('OMNICHANNEL SUPPORT TICKETS & SLA MONITOR', style: TextStyle(fontSize: 14, fontWeight: FontWeight.bold, color: Color(0xFF64748B))),
                ElevatedButton.icon(
                  onPressed: () async {
                    final details = await recordForm(context, 'Raise Support Ticket', ['Subject / Issue', 'Customer Account', 'Priority (HIGH/MEDIUM/LOW)']);
                    if (details != null && details[0].isNotEmpty) {
                      await store.call('saveRecord', {
                        'appId': 'helpdesk',
                        'record': {
                          'subject': details[0],
                          'customer': details[1],
                          'priority': details[2].toUpperCase(),
                          'status': 'OPEN',
                          'assignedAgent': 'Support Desk Queue',
                        }
                      });
                    }
                  },
                  icon: const Icon(Icons.confirmation_number_rounded, size: 16),
                  label: const Text('New Support Ticket'),
                  style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFF0284C7), foregroundColor: Colors.white),
                ),
              ],
            ),
            const SizedBox(height: 16),
            StreamBuilder<List<Map<String, dynamic>>>(
              stream: store.watch('tickets'),
              builder: (context, snapshot) {
                if (!snapshot.hasData) return const CircularProgressIndicator();
                final tickets = snapshot.data!;
                return Card(
                  child: ListView.separated(
                    shrinkWrap: true,
                    physics: const NeverScrollableScrollPhysics(),
                    itemCount: tickets.length,
                    separatorBuilder: (context, index) => const Divider(height: 1),
                    itemBuilder: (context, idx) {
                      final tkt = tickets[idx];
                      final isOpen = tkt['status'] == 'OPEN';
                      return ListTile(
                        leading: CircleAvatar(
                          backgroundColor: const Color(0xFF0284C7).withValues(alpha: 0.1),
                          child: Icon(isOpen ? Icons.mark_chat_unread_rounded : Icons.check_circle_rounded, color: const Color(0xFF0284C7)),
                        ),
                        title: Text(tkt['subject'] ?? tkt['name'] ?? 'Support Request', style: const TextStyle(fontWeight: FontWeight.bold)),
                        subtitle: Text('Customer: ${tkt['customer']} · Assigned: ${tkt['assignedAgent']}'),
                        trailing: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Chip(
                              label: Text(tkt['priority'] ?? 'MEDIUM', style: const TextStyle(fontSize: 10, fontWeight: FontWeight.bold)),
                              backgroundColor: tkt['priority'] == 'HIGH' ? const Color(0xFFFEE2E2) : const Color(0xFFE0F2FE),
                            ),
                            const SizedBox(width: 8),
                            Chip(
                              label: Text(tkt['status']),
                              backgroundColor: isOpen ? const Color(0xFFFEF3C7) : const Color(0xFFD1FAE5),
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
