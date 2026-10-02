import 'package:flutter/material.dart';
import '../suite.dart';
import '../widgets/record_form.dart';
import 'talent_marketplace.dart';

class HrModuleScreen extends StatefulWidget {
  final SuiteStore store;

  const HrModuleScreen({super.key, required this.store});

  @override
  State<HrModuleScreen> createState() => _HrModuleScreenState();
}

class _HrModuleScreenState extends State<HrModuleScreen> {
  String? selectedId;

  @override
  void initState() {
    super.initState();
    widget.store.addListener(_onStore);
  }

  @override
  void didUpdateWidget(HrModuleScreen oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.store != widget.store) {
      oldWidget.store.removeListener(_onStore);
      widget.store.addListener(_onStore);
    }
  }

  @override
  void dispose() {
    widget.store.removeListener(_onStore);
    super.dispose();
  }

  void _onStore() {
    if (mounted) setState(() {});
  }

  Future<void> runPayroll() async {
    final employeeId = selectedId;
    if (employeeId == null) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Select an employee, then run payroll.')));
      return;
    }
    final details = await recordForm(context, 'Statutory payroll', ['Period YYYY-MM', 'Gross pay in shillings']);
    if (details == null || !mounted) return;
    final shillings = int.tryParse(details[1].trim());
    if (shillings == null || shillings <= 0) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Enter gross pay in whole shillings.')));
      return;
    }
    try {
      final result = await widget.store.call('runStatutoryPayroll', {
        'employeeId': employeeId,
        'period': details[0].trim(),
        'grossMinor': shillings * 100,
      });
      if (!mounted) return;
      final net = result['netMinor'];
      final already = result['alreadyPosted'] == true;
      final message = net is num
          ? '${already ? 'Payslip already posted' : 'Payslip posted'}. Net ${kes(net)}. PAYE ${kes((result['payeMinor'] as num?) ?? 0)}. NSSF ${kes((result['nssfEmployeeMinor'] as num?) ?? 0)}. SHIF ${kes((result['shifMinor'] as num?) ?? 0)}. Housing ${kes((result['housingEmployeeMinor'] as num?) ?? 0)}. Rate card ${result['rateCard']}.'
          : 'Payroll request sent.';
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(message)));
    } catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$error')));
    }
  }

  @override
  Widget build(BuildContext context) {
    final store = widget.store;
    return DefaultTabController(
      length: 2,
      child: Scaffold(
      appBar: AppBar(
        title: const Row(
          children: [
            Icon(Icons.badge_rounded, color: Color(0xFFEC4899)),
            SizedBox(width: 10),
            Text('People & Attendance System'),
          ],
        ),
        bottom: const TabBar(
          tabs: [
            Tab(icon: Icon(Icons.groups_rounded), text: 'People'),
            Tab(icon: Icon(Icons.psychology_alt_rounded), text: 'Talent insights'),
          ],
        ),
      ),
      body: TabBarView(
        children: [
          _peopleTab(context, store),
          HiringInsightsPanel(store: store),
        ],
      ),
      ),
    );
  }

  Widget _peopleTab(BuildContext context, SuiteStore store) {
    return SingleChildScrollView(
        padding: const EdgeInsets.all(24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('EMPLOYEE DIRECTORY & CLOCK-IN STATUS', style: TextStyle(fontSize: 14, fontWeight: FontWeight.bold, color: Color(0xFF64748B))),
            const SizedBox(height: 8),
            const Text('Select an employee. Payroll uses the February 2026 PAYE, NSSF, SHIF and housing levy card and posts a balanced journal. It does not file a KRA return or send M-Pesa.'),
            const SizedBox(height: 12),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                ElevatedButton.icon(
                  onPressed: runPayroll,
                  icon: const Icon(Icons.payments_rounded, size: 16),
                  label: Text(selectedId == null ? 'Run Payroll' : 'Run Payroll for $selectedId'),
                ),
                ElevatedButton.icon(
                  onPressed: () async {
                    final details = await recordForm(context, 'Add New Staff Member', ['Full Name', 'Job Role', 'Department', 'Branch', 'Skills (comma separated)']);
                    if (details != null && details[0].isNotEmpty) {
                      await store.call('saveRecord', {
                        'appId': 'hr',
                        'record': {
                          'name': details[0],
                          'role': details[1],
                          'department': details[2],
                          'branch': details[3],
                          'skills': details[4],
                          'status': 'CLOCKED_IN',
                          'clockTime': '08:00 AM',
                        }
                      });
                    }
                  },
                  icon: const Icon(Icons.person_add_alt_1_rounded, size: 16),
                  label: const Text('Add Employee'),
                  style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFFEC4899), foregroundColor: Colors.white),
                ),
              ],
            ),
            const SizedBox(height: 16),
            StreamBuilder<List<Map<String, dynamic>>>(
              stream: store.watch('employees'),
              builder: (context, snapshot) {
                if (!snapshot.hasData) return const CircularProgressIndicator();
                final staff = snapshot.data!;
                return Card(
                  child: ListView.separated(
                    shrinkWrap: true,
                    physics: const NeverScrollableScrollPhysics(),
                    itemCount: staff.length,
                    separatorBuilder: (context, index) => const Divider(height: 1),
                    itemBuilder: (context, idx) {
                      final e = staff[idx];
                      final isClockedIn = e['status'] == 'CLOCKED_IN';
                      return ListTile(
                        selected: selectedId == e['id'],
                        onTap: () => setState(() => selectedId = e['id'] as String?),
                        leading: CircleAvatar(
                          backgroundColor: const Color(0xFFEC4899).withValues(alpha: 0.1),
                          child: Text(e['name'][0], style: const TextStyle(fontWeight: FontWeight.bold, color: Color(0xFFEC4899))),
                        ),
                        title: Text(e['name'], style: const TextStyle(fontWeight: FontWeight.bold)),
                        subtitle: Text('${e['id']} · ${e['role']} · ${e['department']} · ${e['branch']}'),
                        trailing: Chip(
                          label: Text(isClockedIn ? 'Clocked in at ${e['clockTime']}' : e['status']),
                          backgroundColor: isClockedIn ? const Color(0xFFD1FAE5) : const Color(0xFFFEE2E2),
                        ),
                      );
                    },
                  ),
                );
              },
            ),
            const SizedBox(height: 24),
            const Text('STATUTORY PAYSLIPS', style: TextStyle(fontSize: 14, fontWeight: FontWeight.bold, color: Color(0xFF64748B))),
            const SizedBox(height: 12),
            StreamBuilder<List<Map<String, dynamic>>>(
              stream: store.watch('payrollPayslips'),
              builder: (context, snapshot) {
                if (!snapshot.hasData) return const CircularProgressIndicator();
                final slips = snapshot.data!;
                if (slips.isEmpty) return const Text('No payslips yet.');
                return Card(
                  child: ListView.separated(
                    shrinkWrap: true,
                    physics: const NeverScrollableScrollPhysics(),
                    itemCount: slips.length,
                    separatorBuilder: (context, index) => const Divider(height: 1),
                    itemBuilder: (context, idx) {
                      final slip = slips[idx];
                      return ListTile(
                        title: Text('${slip['employeeName'] ?? slip['employeeId']} · ${slip['period']}', style: const TextStyle(fontWeight: FontWeight.bold)),
                        subtitle: Text('PAYE ${kes((slip['payeMinor'] as num?) ?? 0)} · NSSF ${kes((slip['nssfEmployeeMinor'] as num?) ?? 0)} · SHIF ${kes((slip['shifMinor'] as num?) ?? 0)} · Housing ${kes((slip['housingEmployeeMinor'] as num?) ?? 0)} · ${slip['rateCard']}'),
                        trailing: Text(kes((slip['netMinor'] as num?) ?? 0), style: const TextStyle(fontWeight: FontWeight.bold)),
                      );
                    },
                  ),
                );
              },
            ),
          ],
        ),
      );
  }
}
