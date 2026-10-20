import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter/material.dart';

/// Restricted ISP operations console. All mutations go through authenticated
/// Cloud Functions; the client does not talk directly to routers or Firestore.
class IspAdminPanel extends StatefulWidget {
  const IspAdminPanel({super.key});

  @override
  State<IspAdminPanel> createState() => _IspAdminPanelState();
}

class _IspAdminPanelState extends State<IspAdminPanel> {
  bool loading = true;
  bool writing = false;
  String? error;
  Map<String, dynamic> overview = const {};
  Map<String, dynamic> telemetry = const {};
  Map<String, dynamic> decisionSupport = const {};
  List<Map<String, dynamic>> supportTickets = const [];
  int tab = 0;

  FirebaseFunctions get functions => FirebaseFunctions.instanceFor(region: 'europe-west1');

  List<Map<String, dynamic>> rows(String name) =>
      (overview[name] as List? ?? const [])
          .whereType<Map>()
          .map((entry) => Map<String, dynamic>.from(entry))
          .toList();

  Future<Map<String, dynamic>> call(String name, [Map<String, dynamic>? data]) async {
    final response = await functions.httpsCallable(name).call(data ?? <String, dynamic>{});
    return Map<String, dynamic>.from(response.data as Map);
  }

  @override
  void initState() {
    super.initState();
    refresh();
  }

  Future<void> refresh() async {
    if (mounted) setState(() { loading = true; error = null; });
    try {
      final next = await call('ispAdminOverview');
      final metrics = await call('ispTelemetrySummary');
      final decisions = await call('ispDecisionSupport');
      final tickets = await call('ispSupportOverview');
      if (mounted) setState(() {
        overview = next; telemetry = metrics; decisionSupport = decisions;
        supportTickets = (tickets['tickets'] as List? ?? const []).whereType<Map>()
            .map((t) => Map<String, dynamic>.from(t)).toList();
      });
    } catch (e) {
      if (mounted) setState(() => error = e.toString());
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  void notice(String message, {bool bad = false}) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(
      content: Text(message),
      backgroundColor: bad ? Colors.red.shade700 : null,
    ));
  }

  Future<void> perform(String action, Map<String, dynamic> data) async {
    if (writing) return;
    setState(() => writing = true);
    try {
      await call(action, data);
      notice('Operation recorded successfully.');
      await refresh();
    } catch (e) {
      notice('Action failed: $e', bad: true);
    } finally {
      if (mounted) setState(() => writing = false);
    }
  }

  Future<Map<String, String>?> ask(
    String title,
    List<String> labels, {
    Map<String, String> defaults = const {},
  }) async {
    final fields = {for (final label in labels) label: TextEditingController(text: defaults[label] ?? '')};
    try {
      return await showDialog<Map<String, String>>(
        context: context,
        builder: (ctx) => AlertDialog(
          title: Text(title),
          content: SizedBox(
            width: 460,
            child: SingleChildScrollView(
              child: Column(mainAxisSize: MainAxisSize.min, children: [
                for (final label in labels)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 12),
                    child: TextField(
                      controller: fields[label],
                      maxLength: label == 'Description' || label == 'Notes' ? 1500 : 120,
                      maxLines: label == 'Description' || label == 'Notes' ? 3 : 1,
                      keyboardType: label == 'Plan speed (Mbps)' ? TextInputType.number : TextInputType.text,
                      decoration: InputDecoration(
                        labelText: label,
                        hintText: label == 'Access type (fiber/wireless)' ? 'fiber or wireless'
                          : label == 'Severity (low/medium/high/critical)' ? 'medium'
                          : label == 'Role (fiber/wireless/core/other)' ? 'fiber'
                          : label == 'Priority (low/normal/urgent)' ? 'normal'
                          : null,
                      ),
                    ),
                  ),
              ]),
            ),
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancel')),
            FilledButton(
              onPressed: () => Navigator.pop(ctx, {
                for (final label in labels) label: fields[label]!.text.trim(),
              }),
              child: const Text('Save record'),
            ),
          ],
        ),
      );
    } finally {
      // Give the dialog route time to finish disposing its input widgets.
      WidgetsBinding.instance.addPostFrameCallback((_) {
        for (final controller in fields.values) {
          controller.dispose();
        }
      });
    }
  }

  Future<void> addCurrent() async {
    if (tab == 0) {
      final data = await ask('Register ISP device', [
        'Device label', 'Vendor', 'Model', 'Role (fiber/wireless/core/other)',
        'Site', 'Serial (optional)', 'Notes',
      ], defaults: {'Role (fiber/wireless/core/other)': 'fiber'});
      if (data == null) return;
      await perform('ispRegisterDevice', {
        'label': data['Device label'], 'vendor': data['Vendor'], 'model': data['Model'],
        'role': data['Role (fiber/wireless/core/other)']?.toLowerCase(),
        'site': data['Site'], 'serial': data['Serial (optional)'], 'notes': data['Notes'],
      });
    } else if (tab == 1) {
      final data = await ask('Plan subscriber', [
        'Account code', 'Site', 'Access type (fiber/wireless)', 'Plan speed (Mbps)',
      ], defaults: {'Access type (fiber/wireless)': 'fiber', 'Plan speed (Mbps)': '20'});
      if (data == null) return;
      await perform('ispAddSubscriber', {
        'accountCode': data['Account code'], 'site': data['Site'],
        'accessType': data['Access type (fiber/wireless)']?.toLowerCase(),
        'planMbps': int.tryParse(data['Plan speed (Mbps)'] ?? '') ?? 0,
      });
    } else if (tab == 2) {
      final data = await ask('Report ISP incident', [
        'Title', 'Site', 'Severity (low/medium/high/critical)', 'Description',
      ], defaults: {'Severity (low/medium/high/critical)': 'medium'});
      if (data == null) return;
      await perform('ispCreateIncident', {
        'title': data['Title'], 'site': data['Site'],
        'severity': data['Severity (low/medium/high/critical)']?.toLowerCase(),
        'description': data['Description'],
      });
    } else {
      final data = await ask('Create technician work order', [
        'Title', 'Site', 'Priority (low/normal/urgent)', 'Description',
      ], defaults: {'Priority (low/normal/urgent)': 'normal'});
      if (data == null) return;
      await perform('ispCreateWorkOrder', {
        'title': data['Title'], 'site': data['Site'],
        'priority': data['Priority (low/normal/urgent)']?.toLowerCase(),
        'description': data['Description'],
      });
    }
  }

  Future<void> submitTelemetry() async {
    final devices = rows('devices');
    if (devices.isEmpty) {
      notice('Register a device before submitting a diagnostic sample.', bad: true);
      return;
    }
    final defaultDevice = devices.first;
    final values = await ask('Record manually measured telemetry', [
      'Device ID', 'Site', 'Segment ID',
      'Latency (ms)', 'Jitter (ms)', 'Packet loss (%)', 'Utilization (%)'
    ], defaults: {
      'Device ID': defaultDevice['id']?.toString() ?? '',
      'Site': defaultDevice['site']?.toString() ?? '',
      'Segment ID': '',
      'Latency (ms)': '10', 'Jitter (ms)': '2',
      'Packet loss (%)': '0', 'Utilization (%)': '25',
    });
    if (values == null) return;
    final fields = {
      'latencyMs': 'Latency (ms)', 'jitterMs': 'Jitter (ms)',
      'packetLossPct': 'Packet loss (%)', 'utilizationPct': 'Utilization (%)',
    };
    final numeric = <String, double>{};
    for (final field in fields.entries) {
      final result = double.tryParse(values[field.value] ?? '');
      if (result == null) {
        notice('Invalid number for ${field.value}', bad: true);
        return;
      }
      numeric[field.key] = result;
    }
    await perform('ispRecordTelemetry', {
      'deviceId': values['Device ID'], 'site': values['Site'],
      'segmentId': values['Segment ID'], ...numeric,
    });
  }

  Future<void> requestProvisioning() async {
    final subs = rows('subscribers');
    final devices = rows('devices');
    if (subs.isEmpty || devices.isEmpty) {
      notice('Register both a subscriber and a device first.', bad: true);
      return;
    }
    final values = await ask('Create non-executing provisioning request', [
      'Subscriber account code', 'Device ID',
      'Operation (activate/suspend/change_plan/deactivate)', 'Justification'
    ], defaults: {
      'Subscriber account code': subs.first['accountCode']?.toString() ?? '',
      'Device ID': devices.first['id']?.toString() ?? '',
      'Operation (activate/suspend/change_plan/deactivate)': 'activate',
      'Justification': 'Engineer to verify link and authorize provisioning',
    });
    if (values == null) return;
    await perform('ispRequestProvisioning', {
      'subscriberId': values['Subscriber account code'],
      'deviceId': values['Device ID'],
      'operation': values['Operation (activate/suspend/change_plan/deactivate)'],
      'justification': values['Justification'],
    });
  }

  Future<void> addSupportTicket() async {
    final subs = rows('subscribers');
    if (subs.isEmpty) {
      notice('Register a planned subscriber before creating a ticket.', bad: true);
      return;
    }
    final values = await ask('Create support ticket', [
      'Subscriber account code', 'Site', 'Customer message',
    ], defaults: {
      'Subscriber account code': subs.first['accountCode']?.toString() ?? '',
      'Site': subs.first['site']?.toString() ?? '',
    });
    if (values == null) return;
    await perform('ispCreateSupportTicket', {
      'subscriberId': values['Subscriber account code'],
      'site': values['Site'],
      'message': values['Customer message'],
    });
  }

  Widget decisionPanel() {
    final capacity = Map<String, dynamic>.from(
      decisionSupport['capacity'] as Map? ?? const {},
    );
    return Card(
      margin: const EdgeInsets.fromLTRB(12, 8, 12, 6),
      child: ExpansionTile(
        leading: const Icon(Icons.psychology_alt_outlined),
        title: const Text('Decision support & customer tickets'),
        subtitle: const Text('Capacity heuristic and rule-based support triage'),
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text('Capacity status: ${capacity['state'] ?? 'insufficient_data'}'),
              Text('Suggested utilization: ${capacity['estimateUtilizationPct'] ?? 'N/A'}%'),
              Text((capacity['recommendation'] ?? 'Collect site measurements.').toString()),
              const SizedBox(height: 6),
              const Text('Customer support classification uses keywords. Predictive ML and WhatsApp automation are not connected.'),
              const SizedBox(height: 10),
              OutlinedButton.icon(
                onPressed: writing ? null : addSupportTicket,
                icon: const Icon(Icons.support_agent),
                label: const Text('Create support ticket'),
              ),
              const SizedBox(height: 10),
              Text('Tickets: ${supportTickets.length}', style: const TextStyle(fontWeight: FontWeight.bold)),
              for (final ticket in supportTickets.take(8))
                ListTile(
                  dense: true,
                  title: Text((ticket['subscriberId'] ?? 'Subscriber').toString()),
                  subtitle: Text('${ticket['category'] ?? 'general'} · ${ticket['nextStep'] ?? ''}'),
                ),
            ]),
          ),
        ],
      ),
    );
  }

  Widget telemetryPanel() {
    final counts = Map<String, dynamic>.from(telemetry['statusCount'] as Map? ?? const {});
    final samples = telemetry['sampleCount'] ?? 0;
    return Card(
      margin: const EdgeInsets.fromLTRB(12, 8, 12, 8),
      child: ExpansionTile(
        leading: const Icon(Icons.monitor_heart_outlined),
        title: Text('Monitoring samples: $samples'),
        subtitle: const Text('Manually submitted data only • live collectors not connected'),
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Wrap(spacing: 12, runSpacing: 6, children: [
                Chip(label: Text('Healthy: ${counts['healthy'] ?? 0}')),
                Chip(label: Text('Warning: ${counts['warning'] ?? 0}')),
                Chip(label: Text('Critical: ${counts['critical'] ?? 0}')),
                Chip(label: Text('Missing: ${counts['insufficient_data'] ?? 0}')),
              ]),
              const SizedBox(height: 8),
              const Text('These are sample-level statistics and cannot be used as verified network uptime or active incidents.'),
              const SizedBox(height: 12),
              Wrap(spacing: 8, runSpacing: 8, children: [
                OutlinedButton.icon(
                  onPressed: writing ? null : submitTelemetry,
                  icon: const Icon(Icons.add_chart_outlined),
                  label: const Text('Record diagnostic reading'),
                ),
                OutlinedButton.icon(
                  onPressed: writing ? null : requestProvisioning,
                  icon: const Icon(Icons.assignment_outlined),
                  label: const Text('Request provisioning approval'),
                ),
              ]),
            ]),
          ),
        ],
      ),
    );
  }

  Widget metric(String label, int count, IconData icon) {
    return Card(child: SizedBox(
      width: 190, child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Icon(icon, color: const Color(0xFF2563EB)),
          const SizedBox(height: 12),
          Text('$count', style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 30)),
          Text(label, style: const TextStyle(color: Color(0xFF64748B))),
        ]),
      ),
    ));
  }

  Widget recordList(String kind) {
    final records = rows(kind);
    if (records.isEmpty) {
      return const Center(child: Padding(
        padding: EdgeInsets.all(32),
        child: Text('No records yet. Use Add record to begin.'),
      ));
    }
    return ListView.separated(
      itemCount: records.length,
      separatorBuilder: (_, __) => const Divider(height: 1),
      itemBuilder: (context, index) {
        final item = records[index];
        final title = (item['label'] ?? item['accountCode'] ?? item['title'] ?? 'Untitled').toString();
        final state = (item['status'] ?? item['lifecycle'] ?? 'planned').toString();
        final detail = [
          item['site'], item['vendor'], item['model'], item['accessType'],
          item['severity'], item['priority'], item['provisioningStatus'],
        ].where((value) => value != null && value.toString().isNotEmpty)
         .map((value) => value.toString()).join(' · ');
        final incident = kind == 'incidents';
        final workOrder = kind == 'workOrders';
        return ListTile(
          isThreeLine: true,
          leading: CircleAvatar(child: Icon(
            incident ? Icons.report_problem_outlined
              : workOrder ? Icons.handyman_outlined
              : kind == 'devices' ? Icons.router_rounded : Icons.person_outline,
          )),
          title: Text(title),
          subtitle: Text('$detail\nStatus: $state'),
          trailing: incident || workOrder
              ? PopupMenuButton<String>(
                  tooltip: 'Update status',
                  enabled: !writing && state != 'resolved' && state != 'completed',
                  onSelected: (next) async {
                    if (incident) {
                      await perform('ispSetIncidentStatus', {'id': item['id'], 'status': next});
                    } else {
                      await perform('ispSetWorkOrderStatus', {'id': item['id'], 'status': next});
                    }
                  },
                  itemBuilder: (_) => incident
                    ? [
                        if (state == 'open') const PopupMenuItem(value: 'acknowledged', child: Text('Acknowledge incident')),
                        const PopupMenuItem(value: 'resolved', child: Text('Mark resolved')),
                      ]
                    : [
                        if (state == 'open') const PopupMenuItem(value: 'in_progress', child: Text('Start work')),
                        const PopupMenuItem(value: 'completed', child: Text('Complete work order')),
                      ],
                )
              : kind == 'devices'
                  ? const Tooltip(message: 'Telemetry not connected', child: Icon(Icons.sensors_off_outlined))
                  : const Tooltip(message: 'Subscriber planned only; not provisioned', child: Icon(Icons.pending_outlined)),
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('ISP Operations Control'),
        actions: [IconButton(
          tooltip: 'Refresh',
          onPressed: loading || writing ? null : refresh,
          icon: const Icon(Icons.refresh_rounded),
        )],
      ),
      body: loading
        ? const Center(child: CircularProgressIndicator())
        : error != null
          ? Center(child: Column(mainAxisSize: MainAxisSize.min, children: [
              Text(error!), const SizedBox(height: 12),
              FilledButton(onPressed: refresh, child: const Text('Retry')),
            ]))
          : Column(children: [
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(18),
                color: const Color(0xFFEFF6FF),
                child: const Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text('Hybrid Fiber + Wireless Pilot', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
                  SizedBox(height: 6),
                  Text('Management records only. Router provisioning, M-Pesa settlement, live diagnostics and automated AI remediation are NOT connected.'),
                  SizedBox(height: 6),
                  SelectableText('Public HTML architecture (after deployment): www.tekntandao.com/isp-architecture.html',
                    style: TextStyle(fontWeight: FontWeight.w600, color: Color(0xFF1D4ED8))),
                ]),
              ),
              Card(
                margin: const EdgeInsets.fromLTRB(12, 10, 12, 2),
                child: ExpansionTile(
                  leading: const Icon(Icons.account_tree_outlined),
                  title: const Text('View hybrid ISP architecture'),
                  subtitle: const Text('Proposed topology — not live network telemetry'),
                  children: [
                    Padding(
                      padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
                      child: Column(children: const [
                        ListTile(leading: Icon(Icons.public), title: Text('Upstream → MikroTik RB5009'),
                          subtitle: Text('Firewall · PPPoE · VLANs · RADIUS · QoS')),
                        ListTile(leading: Icon(Icons.cable), title: Text('Fiber: VSOL OLT → 2 × 1:16 splitters'),
                          subtitle: Text('32 planned ONT subscribers; interoperability unverified')),
                        ListTile(leading: Icon(Icons.wifi_tethering), title: Text('Wireless: 2 COMFAST bridge pairs'),
                          subtitle: Text('Two remote buildings → managed switches → 9 routers each')),
                        ListTile(leading: Icon(Icons.hub_outlined), title: Text('Control platform: monitoring, ACS and CRM'),
                          subtitle: Text('Diagnostics, AI, M-Pesa and provisioning adapters require integration')),
                      ]),
                    ),
                  ],
                ),
              ),
              telemetryPanel(),
              decisionPanel(),
              SizedBox(
                height: 147,
                child: ListView(scrollDirection: Axis.horizontal, padding: const EdgeInsets.all(8), children: [
                  metric('Registered devices', rows('devices').length, Icons.router_outlined),
                  metric('Planned subscribers', rows('subscribers').length, Icons.people_outline),
                  metric('Open incidents', rows('incidents').where((x) => x['status'] != 'resolved').length, Icons.warning_amber_outlined),
                  metric('Open work orders', rows('workOrders').where((x) => x['status'] != 'completed').length, Icons.handyman_outlined),
                ]),
              ),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 12),
                child: Row(children: [
                  Expanded(child: SingleChildScrollView(
                    scrollDirection: Axis.horizontal,
                    child: SegmentedButton<int>(
                      segments: const [
                        ButtonSegment(value: 0, label: Text('Devices'), icon: Icon(Icons.router)),
                        ButtonSegment(value: 1, label: Text('Subscribers'), icon: Icon(Icons.people)),
                        ButtonSegment(value: 2, label: Text('Incidents'), icon: Icon(Icons.warning_amber)),
                        ButtonSegment(value: 3, label: Text('Work orders'), icon: Icon(Icons.handyman)),
                      ],
                      selected: {tab},
                      onSelectionChanged: (selection) => setState(() => tab = selection.first),
                    ),
                  )),
                  const SizedBox(width: 12),
                  FilledButton.icon(
                    onPressed: writing ? null : addCurrent,
                    icon: const Icon(Icons.add),
                    label: const Text('Add record'),
                  ),
                ]),
              ),
              if (writing) const LinearProgressIndicator(),
              Expanded(child: recordList(['devices', 'subscribers', 'incidents', 'workOrders'][tab])),
            ]),
    );
  }
}
