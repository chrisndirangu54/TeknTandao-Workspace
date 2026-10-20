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
      if (mounted) setState(() => overview = next);
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
