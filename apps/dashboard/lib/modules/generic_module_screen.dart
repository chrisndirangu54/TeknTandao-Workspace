import 'package:flutter/material.dart';
import '../suite.dart';
import '../widgets/record_form.dart';

class GenericEnterpriseModuleScreen extends StatelessWidget {
  final SuiteModule module;
  final SuiteStore store;

  const GenericEnterpriseModuleScreen({
    super.key,
    required this.module,
    required this.store,
  });

  List<String> _formFields() {
    switch (module.id) {
      case 'analytics':
        return ['Dashboard Title', 'Data Source', 'Chart Type', 'Refresh Rate'];
      case 'surveys':
        return ['Survey Name', 'Target Audience', 'Question 1', 'NPS Threshold'];
      case 'expenses':
        return ['Expense Title', 'Expense Category', 'Amount (KES)', 'Receipt Reference'];
      case 'subscriptions':
        return ['Customer Name', 'Plan Tier', 'Monthly Fee (KES)', 'Billing Cycle'];
      case 'recruitment':
        return ['Job Position Title', 'Department', 'Required Experience', 'Opening Status'];
      case 'lms':
        return ['Course Title', 'Target Skill', 'Modules Count', 'Passing Score'];
      default:
        return ['Record Title', 'Category / Type', 'Primary Value', 'Notes / Status'];
    }
  }

  @override
  Widget build(BuildContext context) {
    final fields = _formFields();
    final path = 'modules/${module.id}/records';

    return Scaffold(
      appBar: AppBar(
        title: Row(
          children: [
            Icon(module.icon, color: module.color),
            const SizedBox(width: 10),
            Expanded(child: Text(module.name, overflow: TextOverflow.ellipsis)),
          ],
        ),
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Wrap(
              spacing: 16,
              runSpacing: 16,
              children: [
                _statCard('Category', module.category, Icons.grid_view_rounded),
                _statCard('Monthly Plan', '${kes(module.monthlyPriceKes)} / mo', Icons.sell_rounded),
                _statCard('Data Path', path, Icons.hub_rounded),
              ],
            ),
            const SizedBox(height: 28),
            Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        '${module.name.toUpperCase()} RECORDS',
                        style: const TextStyle(fontSize: 14, fontWeight: FontWeight.bold, color: Color(0xFF64748B)),
                      ),
                      const SizedBox(height: 4),
                      Text(module.description, style: const TextStyle(color: Color(0xFF64748B))),
                    ],
                  ),
                ),
                ElevatedButton.icon(
                  onPressed: () async {
                    final details = await recordForm(context, 'Add ${module.name} Record', fields);
                    if (details == null || details.isEmpty || details[0].trim().isEmpty) return;
                    await store.call('saveRecord', {
                      'appId': module.id,
                      'record': {
                        'title': details[0].trim(),
                        'category': details.length > 1 ? details[1].trim() : '',
                        'primaryValue': details.length > 2 ? details[2].trim() : '',
                        'notes': details.length > 3 ? details[3].trim() : '',
                        'status': 'ACTIVE',
                      },
                    });
                  },
                  icon: const Icon(Icons.add_circle_outline_rounded, size: 16),
                  label: const Text('Add record'),
                ),
              ],
            ),
            const SizedBox(height: 12),
            StreamBuilder<List<Map<String, dynamic>>>(
              stream: store.watch(path),
              builder: (context, snapshot) {
                if (snapshot.connectionState == ConnectionState.waiting && !snapshot.hasData) {
                  return const Padding(
                    padding: EdgeInsets.all(24),
                    child: Center(child: CircularProgressIndicator()),
                  );
                }
                if (snapshot.hasError) {
                  return Card(
                    child: Padding(
                      padding: const EdgeInsets.all(20),
                      child: Text('Unable to load ${module.name} records: ${snapshot.error}'),
                    ),
                  );
                }
                final records = snapshot.data ?? const <Map<String, dynamic>>[];
                if (records.isEmpty) {
                  return Card(
                    child: Padding(
                      padding: const EdgeInsets.all(28),
                      child: Row(
                        children: [
                          Icon(Icons.inbox_outlined, color: module.color),
                          const SizedBox(width: 12),
                          Expanded(
                            child: Text(
                              'No records yet. Add the first ${module.name} record for this organization.',
                              style: const TextStyle(color: Color(0xFF64748B)),
                            ),
                          ),
                        ],
                      ),
                    ),
                  );
                }
                return Card(
                  child: ListView.separated(
                    shrinkWrap: true,
                    physics: const NeverScrollableScrollPhysics(),
                    itemCount: records.length,
                    separatorBuilder: (_, __) => const Divider(height: 1),
                    itemBuilder: (context, index) {
                      final item = records[index];
                      final name = item['title'] ?? item['name'] ?? 'Record ${index + 1}';
                      final details = item.entries
                          .where((entry) => !{'id', 'title', 'name', 'status', 'updatedAt', 'updatedBy'}.contains(entry.key))
                          .where((entry) => entry.value != null && entry.value.toString().isNotEmpty)
                          .take(3)
                          .map((entry) => '${entry.key}: ${entry.value}')
                          .join(' · ');
                      return ListTile(
                        leading: CircleAvatar(
                          backgroundColor: module.color.withValues(alpha: 0.1),
                          child: Icon(module.icon, color: module.color),
                        ),
                        title: Text(name.toString(), style: const TextStyle(fontWeight: FontWeight.bold)),
                        subtitle: details.isEmpty ? null : Text(details),
                        trailing: Chip(label: Text(item['status']?.toString() ?? 'ACTIVE')),
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

  Widget _statCard(String label, String value, IconData icon) {
    return SizedBox(
      width: 280,
      child: Container(
        padding: const EdgeInsets.all(18),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: const Color(0xFFE2E8F0)),
        ),
        child: Row(
          children: [
            Icon(icon, color: module.color, size: 26),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(label, style: const TextStyle(fontSize: 11, fontWeight: FontWeight.bold, color: Color(0xFF64748B))),
                  const SizedBox(height: 3),
                  Text(value, maxLines: 2, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.bold)),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
