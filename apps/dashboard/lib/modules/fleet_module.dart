import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../suite.dart';
import '../widgets/record_form.dart';

/// Multi-tenant logistics control tower. No simulated shipment KPIs are shown.
class FleetModuleScreen extends StatefulWidget {
  final SuiteStore store;
  const FleetModuleScreen({super.key, required this.store});

  @override
  State<FleetModuleScreen> createState() => _FleetModuleScreenState();
}

class _FleetModuleScreenState extends State<FleetModuleScreen> {
  bool loading = true;
  String? error;
  Map<String, dynamic> data = const {};
  List<Map<String, dynamic>> get shipments => _rows('shipments');
  List<Map<String, dynamic>> get carriers => _rows('carriers');
  List<Map<String, dynamic>> get vehicles => _rows('vehicles');
  List<Map<String, dynamic>> get providers => _rows('providers');

  List<Map<String, dynamic>> _rows(String key) =>
      (data[key] as List? ?? const []).whereType<Map>()
          .map((row) => Map<String, dynamic>.from(row)).toList();

  @override
  void initState() {
    super.initState();
    _refresh();
  }

  Future<void> _refresh() async {
    setState(() { loading = true; error = null; });
    try {
      final result = widget.store.demo
          ? <String, dynamic>{'shipments': [], 'carriers': [], 'vehicles': [],
              'providers': [], 'kpis': {'total': 0, 'inTransit': 0,
                'delivered': 0, 'exceptions': 0}}
          : await widget.store.call('logisticsControlTower');
      if (mounted) setState(() => data = result);
    } catch (e) {
      if (mounted) setState(() => error = e.toString());
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  Future<void> _action(String action, Map<String, dynamic> input,
      {String? success}) async {
    try {
      if (widget.store.demo) {
        throw StateError('Preview mode cannot submit live logistics data');
      }
      final result = await widget.store.call(action, input);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: Text(success ?? 'Completed: ${result['status'] ?? 'record saved'}'),
      ));
      await _refresh();
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: Text('Request not completed: $e'),
        backgroundColor: Colors.red.shade700,
      ));
    }
  }

  Future<void> _newShipment() async {
    final values = await recordForm(context, 'Create shipment',
      ['Reference', 'Customer', 'Origin', 'Destination',
        'Weight in kg', 'Cargo description']);
    if (values == null || values.length < 6) return;
    final weight = double.tryParse(values[4]);
    if (weight == null || weight < 0) {
      _notice('Enter a valid non-negative weight'); return;
    }
    await _action('logisticsCreateShipment', {'shipment': {
      'reference': values[0], 'customer': values[1], 'origin': values[2],
      'destination': values[3], 'weightKg': weight,
      'description': values[5], 'mode': 'road', 'currency': 'KES',
    }}, success: 'Shipment created as draft');
  }

  Future<void> _newCarrier() async {
    final values = await recordForm(context, 'Add logistics company',
      ['Company name', 'Provider ID (dhl, fedex, ups, aramex, g4s, fargo, other)',
        'Contact name or number', 'Service region', 'Base tariff in KES']);
    if (values == null || values.length < 5) return;
    final base = double.tryParse(values[4]);
    if (base == null || base < 0) { _notice('Enter a valid base tariff'); return; }
    await _action('logisticsRegisterCarrier', {'carrier': {
      'company': values[0], 'providerId': values[1].trim().toLowerCase(),
      'contact': values[2], 'serviceRegion': values[3], 'currency': 'KES',
      'tariffMinor': (base * 100).round(), 'tariffPerKgMinor': 0,
    }}, success: 'Carrier saved; API connection remains unconfigured');
  }

  Future<void> _issuePartnerKey(Map<String, dynamic> carrier) async {
    try {
      if (widget.store.demo) throw StateError('Preview mode only');
      final result = await widget.store.call('logisticsIssuePartnerToken',
          {'carrierId': carrier['id']});
      if (!mounted) return;
      final token = result['token']?.toString() ?? '';
      await showDialog<void>(context: context, builder: (ctx) => AlertDialog(
        title: Text('One-time integration key · ${carrier['company']}'),
        content: SizedBox(width: 520, child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('Share only with the approved logistics partner. '
                'This token grants shipment milestone updates for this carrier '
                'within this workspace. It expires in 90 days.'),
            const SizedBox(height: 12),
            SelectableText(token),
          ],
        )),
        actions: [
          TextButton.icon(
            onPressed: () async {
              await Clipboard.setData(ClipboardData(text: token));
              if (ctx.mounted) Navigator.pop(ctx);
            },
            icon: const Icon(Icons.copy), label: const Text('Copy and close')),
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Close')),
        ],
      ));
      await _refresh();
    } catch (e) { _notice('Cannot issue carrier key: $e'); }
  }

  Future<void> _revokePartnerKey(Map<String, dynamic> carrier) async {
    final accepted = await showDialog<bool>(context: context, builder: (ctx) =>
      AlertDialog(title: const Text('Revoke integration key?'),
        content: Text('Stop external updates from ${carrier['company']} immediately?'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Cancel')),
          FilledButton(onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Revoke')),
        ]));
    if (accepted != true) return;
    await _action('logisticsRevokePartnerToken',
      {'carrierId': carrier['id']}, success: 'Partner token revoked');
  }

  Future<void> _newVehicle() async {
    final values = await recordForm(context, 'Register fleet vehicle',
      ['Registration', 'Capacity in kg', 'Driver']);
    if (values == null || values.length < 3) return;
    final capacity = double.tryParse(values[1]);
    if (capacity == null || capacity <= 0) { _notice('Enter a valid capacity'); return; }
    await _action('logisticsRegisterVehicle', {'vehicle': {
      'registration': values[0], 'capacityKg': capacity,
      'driver': values[2], 'available': true,
    }}, success: 'Vehicle registered');
  }

  Future<void> _milestone(Map<String, dynamic> shipment) async {
    final values = await recordForm(context, 'Record shipment milestone',
      ['New status (booked, picked_up, in_transit, at_hub, customs_hold, exception, out_for_delivery, delivered, cancelled)',
        'Location', 'Supporting note']);
    if (values == null || values.length < 3) return;
    await _action('logisticsRecordMilestone', {
      'shipmentId': shipment['id'], 'event': {
        'status': values[0].trim().toLowerCase().replaceAll(' ', '_'),
        'location': values[1], 'note': values[2],
      }
    }, success: 'Milestone recorded with an audit event');
  }

  Future<void> _insight(String name, Map<String, dynamic> args, String title) async {
    try {
      if (widget.store.demo) throw StateError('Not available in preview mode');
      final result = await widget.store.call(name, args);
      if (!mounted) return;
      await showDialog<void>(context: context, builder: (context) => AlertDialog(
        title: Text(title),
        content: SizedBox(width: 560, child: SingleChildScrollView(
          child: SelectableText(_formatInsight(name, result)),
        )),
        actions: [TextButton(onPressed: () => Navigator.pop(context),
          child: const Text('Close'))],
      ));
    } catch (e) { _notice('Provider or plan unavailable: $e'); }
  }

  String _formatInsight(String action, Map<String, dynamic> result) {
    if (action == 'logisticsCompareTariffs') {
      final quotes = (result['quotes'] as List? ?? const []);
      if (quotes.isEmpty) return 'No operator-entered tariffs for this currency. Live quotes are not configured.';
      return ['Indicative estimates only (not binding carrier quotes):',
        ...quotes.whereType<Map>().map((q) =>
          '${q['company']}: ${q['currency']} ${((q['estimatedCostMinor'] as num? ?? 0) / 100).toStringAsFixed(2)}')].join('\n');
    }
    if (action == 'logisticsDispatchProposal') {
      final assignments = (result['assignments'] as List? ?? const []);
      return ['Capacity-only proposals; review routes and traffic before dispatch.',
        ...assignments.whereType<Map>().map((a) =>
          '${a['vehicleId']}: ${a['shipmentIds']} · ${a['loadKg']} kg'),
        'Unassigned: ${result['unassigned']}'].join('\n');
    }
    return 'DHL tracking (live if configured):\nStatus: ${result['statusDescription'] ?? result['status'] ?? 'Unknown'}\n'
      'Reference: ${result['trackingNumber'] ?? '-'}\n'
      'Events: ${result['events'] ?? const []}\n'
      'This lookup does not automatically overwrite the shipment record.';
  }

  void _notice(String message) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(message)));
  }

  Widget _metric(String label, Object? value, IconData icon) => SizedBox(
    width: 206, child: Card(child: Padding(padding: const EdgeInsets.all(16),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Icon(icon, color: const Color(0xFF0369A1)),
        const SizedBox(height: 8),
        Text('${value ?? 0}', style: const TextStyle(fontSize: 26, fontWeight: FontWeight.bold)),
        Text(label, style: const TextStyle(color: Color(0xFF64748B))),
      ]))));

  Widget _section(String title, Widget child, {Widget? action}) => Card(
    child: Padding(padding: const EdgeInsets.all(18), child: Column(
      crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [Expanded(child: Text(title, style: Theme.of(context)
          .textTheme.titleLarge)), if (action != null) action]),
        const SizedBox(height: 12), child,
      ])),
  );

  @override
  Widget build(BuildContext context) {
    final kpis = Map<String, dynamic>.from(data['kpis'] as Map? ?? {});
    return Scaffold(
      appBar: AppBar(title: const Text('Logistics Intelligence Hub'),
        actions: [IconButton(onPressed: _refresh, tooltip: 'Refresh live data',
          icon: const Icon(Icons.refresh))]),
      body: loading && data.isEmpty
          ? const Center(child: CircularProgressIndicator())
          : RefreshIndicator(onRefresh: _refresh, child: ListView(
              padding: const EdgeInsets.all(20), children: [
                Text('Multi-company transportation, freight, dispatch and carrier control tower',
                  style: Theme.of(context).textTheme.titleMedium),
                const SizedBox(height: 6),
                if (widget.store.demo) const Text('Preview mode: records are empty; carrier APIs are not connected.'),
                if (error != null) Text(error!, style: const TextStyle(color: Colors.red)),
                const SizedBox(height: 14),
                Wrap(spacing: 12, runSpacing: 12, children: [
                  _metric('Shipments in view', kpis['total'], Icons.inventory_2_outlined),
                  _metric('In transit', kpis['inTransit'], Icons.local_shipping_outlined),
                  _metric('Delivered', kpis['delivered'], Icons.task_alt),
                  _metric('Exceptions / customs', kpis['exceptions'], Icons.warning_amber_rounded),
                ]),
                const SizedBox(height: 18),
                _section('Shipments and milestones',
                  shipments.isEmpty
                    ? const Text('No shipments recorded. Create the first shipment to begin.')
                    : Column(children: shipments.map((s) => Column(children: [
                      ListTile(
                        title: Text('${s['reference']} · ${s['customer']}'),
                        subtitle: Text('${s['origin']} → ${s['destination']} · '
                          '${s['weightKg']} kg · ${s['status']}'),
                        trailing: PopupMenuButton<String>(
                          tooltip: 'Shipment actions',
                          onSelected: (value) {
                            if (value == 'milestone') { _milestone(s); }
                            if (value == 'tariff') {
                              _insight('logisticsCompareTariffs',
                                {'shipmentId': s['id']}, 'Compare tariffs');
                            }
                            if (value == 'tracking') {
                              _insight('logisticsTrackDhl',
                                {'shipmentId': s['id']}, 'DHL tracking');
                            }
                          },
                          itemBuilder: (_) => const [
                            PopupMenuItem(value: 'milestone', child: Text('Record milestone')),
                            PopupMenuItem(value: 'tariff', child: Text('Compare tariffs')),
                            PopupMenuItem(value: 'tracking', child: Text('DHL live tracking')),
                          ],
                        ),
                      ), const Divider(height: 1),
                    ])).toList()),
                  action: TextButton.icon(onPressed: _newShipment,
                    icon: const Icon(Icons.add), label: const Text('Create shipment'))),
                const SizedBox(height: 16),
                _section('Logistics companies and partners',
                  carriers.isEmpty
                      ? const Text('No partner carriers registered yet.')
                      : Column(children: carriers.map((c) => ListTile(
                          leading: const Icon(Icons.business_outlined),
                          title: Text('${c['company']}'),
                          subtitle: Text('${c['providerId']} · ${c['serviceRegion']}'),
                          trailing: PopupMenuButton<String>(
                            tooltip: 'Carrier integration settings',
                            onSelected: (choice) {
                              if (choice == 'issue') { _issuePartnerKey(c); }
                              if (choice == 'revoke') { _revokePartnerKey(c); }
                            },
                            itemBuilder: (_) => const [
                              PopupMenuItem(value: 'issue',
                                child: Text('Issue 90-day partner key')),
                              PopupMenuItem(value: 'revoke',
                                child: Text('Revoke partner key')),
                            ],
                            child: Chip(label: Text(
                              c['connectionStatus'] == 'partner_webhook_ready'
                                  ? 'B2B webhook active' : 'Manual / not connected')),
                          ),
                        )).toList()),
                  action: TextButton.icon(onPressed: _newCarrier,
                    icon: const Icon(Icons.add_business), label: const Text('Add company'))),
                const SizedBox(height: 16),
                _section('Fleet capacity and dispatch',
                  Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    if (vehicles.isEmpty) const Text('No fleet vehicles registered.'),
                    ...vehicles.map((v) => ListTile(
                      leading: const Icon(Icons.local_shipping_outlined),
                      title: Text('${v['registration']} · ${v['driver']}'),
                      subtitle: Text('Payload: ${v['capacityKg']} kg'),
                      trailing: Text(v['available'] == true ? 'Available' : 'Unavailable'),
                    )),
                    const SizedBox(height: 10),
                    OutlinedButton.icon(
                      onPressed: () => _insight('logisticsDispatchProposal', {},
                        'Explainable capacity dispatch plan'),
                      icon: const Icon(Icons.route), label: const Text('Propose dispatch')),
                  ]),
                  action: TextButton.icon(onPressed: _newVehicle,
                    icon: const Icon(Icons.add), label: const Text('Add vehicle'))),
                const SizedBox(height: 16),
                _section('Carrier integration catalogue',
                  providers.isEmpty
                    ? const Text('Connect to a live Workspace to retrieve available providers.')
                    : Wrap(spacing: 8, runSpacing: 8, children: providers.map((p) => Chip(
                      avatar: const Icon(Icons.hub_outlined, size: 16),
                      label: Text('${p['name']} · ${p['connectionStatus']}'),
                    )).toList())),
                const SizedBox(height: 16),
                const Text('Live carrier operations require provider credentials,'
                  ' commercial approval and tenant authorization. Route and cost'
                  ' estimates are not live quotations or traffic-aware optimization.',
                  style: TextStyle(color: Color(0xFF64748B))),
              ],
            )),
    );
  }
}
