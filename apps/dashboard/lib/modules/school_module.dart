import 'package:flutter/services.dart';
import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';
import '../suite.dart';
import '../widgets/record_form.dart';
import 'connected_records.dart';

class SchoolModuleScreen extends StatelessWidget {
  final SuiteStore store;

  const SchoolModuleScreen({super.key, required this.store});

  @override
  Widget build(BuildContext context) {
    return DefaultTabController(
      length: 3,
      child: Scaffold(
        appBar: AppBar(title: const Text('School Management'), bottom: const TabBar(tabs: [
          Tab(text: 'Students'), Tab(text: 'Learning records'), Tab(text: 'Funzi tutoring'),
        ])),
        body: TabBarView(children: [
          _StudentDirectory(store: store),
          ConnectedRecords(store: store, appId: 'school', types: schoolRecordTypes),
          _FunziTutoringPartnerPanel(store: store),
        ]),
      ),
    );
  }
}

class _StudentDirectory extends StatelessWidget {
  final SuiteStore store;
  const _StudentDirectory({required this.store});
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Row(
          children: [
            Icon(Icons.school_rounded, color: Color(0xFF06B6D4)),
            SizedBox(width: 10),
            Text('School Management System'),
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
                const Text('STUDENT ROSTER & FEE STATUS', style: TextStyle(fontSize: 14, fontWeight: FontWeight.bold, color: Color(0xFF64748B))),
                OutlinedButton.icon(
                  icon: const Icon(Icons.link),
                  label: const Text('Connect Funzi'),
                  onPressed: () async {
                    final details = await recordForm(context, 'Link student with Funzi',
                      ['Student ID']);
                    if (details == null || details.isEmpty || details[0].trim().isEmpty) return;
                    try {
                      final result = await store.call('createFunziLinkCode',
                        {'studentId': details[0].trim()});
                      final code = '${result['requestId']}:${result['code']}';
                      await Clipboard.setData(ClipboardData(text: code));
                      if (context.mounted) {
                        await showDialog<void>(
                          context: context,
                          builder: (dialogContext) => AlertDialog(
                            title: const Text('Funzi linking code copied'),
                            content: const Text('Sign in to Funzi as the learner or parent, select Connect school, and paste the code. It expires after 5 minutes. Do not share it with anyone else.'),
                            actions: [TextButton(onPressed: () => Navigator.pop(dialogContext), child: const Text('OK'))],
                          ),
                        );
                      }
                    } catch (error) {
                      if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(
                        SnackBar(content: Text('Unable to create Funzi link: $error')));
                    }
                  },
                ),
                ElevatedButton.icon(
                  onPressed: () async {
                    final details = await recordForm(context, 'Enroll Student', ['Student Name', 'Grade / Class', 'Guardian Name & Phone']);
                    if (details != null && details[0].isNotEmpty) {
                      await store.call('saveRecord', {
                        'appId': 'school',
                        'record': {
                          'name': details[0],
                          'grade': details[1],
                          'guardian': details[2],
                          'feeStatus': 'PENDING',
                          'balanceKes': 3500000,
                        }
                      });
                    }
                  },
                  icon: const Icon(Icons.school_rounded, size: 16),
                  label: const Text('Enroll Student'),
                  style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFF06B6D4), foregroundColor: Colors.white),
                ),
              ],
            ),
            const SizedBox(height: 16),
            StreamBuilder<List<Map<String, dynamic>>>(
              stream: store.watch('students'),
              builder: (context, snapshot) {
                if (!snapshot.hasData) return const CircularProgressIndicator();
                final students = snapshot.data!;
                return Card(
                  child: ListView.separated(
                    shrinkWrap: true,
                    physics: const NeverScrollableScrollPhysics(),
                    itemCount: students.length,
                    separatorBuilder: (context, index) => const Divider(height: 1),
                    itemBuilder: (context, idx) {
                      final s = students[idx];
                      final isPaid = s['feeStatus'] == 'PAID';
                      return ListTile(
                        leading: CircleAvatar(
                          backgroundColor: const Color(0xFF06B6D4).withValues(alpha: 0.1),
                          child: const Icon(Icons.person_rounded, color: Color(0xFF06B6D4)),
                        ),
                        title: Text('${s['name']} (${s['grade']})', style: const TextStyle(fontWeight: FontWeight.bold)),
                        subtitle: Text('Student ID: ${s['id']}\nGuardian: ${s['guardian']}'),
                        trailing: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            if ((s['balanceKes'] as int) > 0)
                              Text('Bal: ${kes(s['balanceKes'])}', style: const TextStyle(fontWeight: FontWeight.bold, color: Colors.redAccent)),
                            const SizedBox(width: 12),
                            Chip(
                              label: Text(s['feeStatus']),
                              backgroundColor: isPaid ? const Color(0xFFD1FAE5) : const Color(0xFFFEF3C7),
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

class _FunziTutoringPartnerPanel extends StatelessWidget {
  const _FunziTutoringPartnerPanel({required this.store});
  final SuiteStore store;
  // Build-time setting. The application must never guess a Funzi deployment.
  static const funziPublicUrl = String.fromEnvironment('FUNZI_PUBLIC_URL', defaultValue: '');

  Future<void> _openFunzi(BuildContext context) async {
    final uri = Uri.tryParse(funziPublicUrl);
    if (uri == null || uri.scheme != 'https' || uri.host.isEmpty) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
          content: Text('Set FUNZI_PUBLIC_URL to the deployed HTTPS Funzi app before enabling this button.'),
        ));
      }
      return;
    }
    if (!await launchUrl(uri, mode: LaunchMode.externalApplication) && context.mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Unable to open Funzi right now.')));
    }
  }

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(24),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text('Offer online tutoring through Funzi',
          style: Theme.of(context).textTheme.headlineSmall),
        const SizedBox(height: 12),
        const Text(
          'Your school can apply to publish moderated tutoring packages. Use a '
          'verified school representative’s Funzi account, enter this TeknTandao '
          'Workspace organization ID, and request school ownership verification. '
          'Packages only appear in Funzi after human review.'),
        const SizedBox(height: 18),
        Card(child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            const Text('School workspace organization ID'),
            SelectableText(store.orgId, style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 8),
            OutlinedButton.icon(
              icon: const Icon(Icons.copy_rounded),
              label: const Text('Copy school ID'),
              onPressed: () async {
                await Clipboard.setData(ClipboardData(text: store.orgId));
                if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(content: Text('Workspace organization ID copied.')));
              },
            ),
            FilledButton.icon(
              icon: const Icon(Icons.open_in_new_rounded),
              label: const Text('Open Funzi to apply'),
              onPressed: () => _openFunzi(context),
            ),
          ]),
        )),
        const SizedBox(height: 18),
        const Text('Personalized schoolwork alignment'),
        const Text(
          'A learner or verified guardian must separately connect their account '
          'using Connect Funzi. Only the linked learner’s class lessons, assignments '
          'and announcements can be read by the configured Funzi service. '
          'Grades, attendance, billing, medical data and class rosters are excluded.'),
        const SizedBox(height: 12),
        const Text(
          'The school must configure the Funzi integration and explicitly authorize '
          'the permitted classes. School package publishing does not automatically '
          'enable learner data access or cross-school visibility.'),
      ]),
    );
  }
}
