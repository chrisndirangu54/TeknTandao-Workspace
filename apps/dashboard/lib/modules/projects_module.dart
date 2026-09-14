import 'package:flutter/material.dart';
import '../suite.dart';
import '../widgets/record_form.dart';

class ProjectsModuleScreen extends StatelessWidget {
  final SuiteStore store;

  const ProjectsModuleScreen({super.key, required this.store});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Row(
          children: [
            Icon(Icons.assignment_rounded, color: Color(0xFF6366F1)),
            SizedBox(width: 10),
            Text('Project & Work Management'),
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
                const Text('ACTIVE ORGANIZATION PROJECTS & MILESTONES', style: TextStyle(fontSize: 14, fontWeight: FontWeight.bold, color: Color(0xFF64748B))),
                ElevatedButton.icon(
                  onPressed: () async {
                    final details = await recordForm(context, 'Create New Project', ['Project Title', 'Client Name', 'Budget (KES)', 'Target Deadline']);
                    if (details != null && details[0].isNotEmpty) {
                      final budget = double.tryParse(details[2]) ?? 0;
                      await store.call('saveRecord', {
                        'appId': 'projects',
                        'record': {
                          'name': details[0],
                          'client': details[1],
                          'budgetKes': (budget * 100).round(),
                          'progressPercent': 0,
                          'status': 'IN_PROGRESS',
                          'deadline': details[3].isEmpty ? '2026-11-30' : details[3],
                        }
                      });
                    }
                  },
                  icon: const Icon(Icons.add_task_rounded, size: 16),
                  label: const Text('New Project'),
                  style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFF6366F1), foregroundColor: Colors.white),
                ),
              ],
            ),
            const SizedBox(height: 16),
            StreamBuilder<List<Map<String, dynamic>>>(
              stream: store.watch('projects'),
              builder: (context, snapshot) {
                if (!snapshot.hasData) return const CircularProgressIndicator();
                final projects = snapshot.data!;
                return ListView.separated(
                  shrinkWrap: true,
                  physics: const NeverScrollableScrollPhysics(),
                  itemCount: projects.length,
                  separatorBuilder: (context, index) => const SizedBox(height: 12),
                  itemBuilder: (context, idx) {
                    final prj = projects[idx];
                    final progress = (prj['progressPercent'] as num).toDouble() / 100.0;
                    return Card(
                      child: Padding(
                        padding: const EdgeInsets.all(16),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(
                              mainAxisAlignment: MainAxisAlignment.spaceBetween,
                              children: [
                                Text(prj['name'], style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
                                Chip(
                                  label: Text(prj['status']),
                                  backgroundColor: prj['status'] == 'COMPLETED' ? const Color(0xFFD1FAE5) : const Color(0xFFE0E7FF),
                                ),
                              ],
                            ),
                            const SizedBox(height: 6),
                            Text('Client: ${prj['client']} · Budget: ${kes(prj['budgetKes'])} · Deadline: ${prj['deadline']}', style: TextStyle(fontSize: 13, color: Colors.grey.shade700)),
                            const SizedBox(height: 12),
                            Row(
                              children: [
                                Expanded(
                                  child: LinearProgressIndicator(
                                    value: progress,
                                    minHeight: 8,
                                    backgroundColor: const Color(0xFFE2E8F0),
                                    color: const Color(0xFF6366F1),
                                  ),
                                ),
                                const SizedBox(width: 12),
                                Text('${prj['progressPercent']}%', style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 12)),
                              ],
                            ),
                          ],
                        ),
                      ),
                    );
                  },
                );
              },
            ),
          ],
        ),
      ),
    );
  }
}
