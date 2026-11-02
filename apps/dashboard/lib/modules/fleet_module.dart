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
  Map<String, dynamic>? fleetYanguState;
  Map<String, dynamic>? fleetYanguData;
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

  Future<void> _connectFleetYangu() async {
    final values = await recordForm(context, 'Connect Fleet Yangu',
      ['Fleet Yangu organisation ID', 'One-time Fleet Yangu Workspace key']);
    if (values == null || values.length < 2) return;
    await _action('logisticsConnectFleetYangu', {
      'sourceOrgId': values[0].trim(), 'token': values[1].trim()
    }, success: 'Fleet Yangu connected. Refresh the vehicle intelligence snapshot.');
    await _loadFleetYangu();
  }

  Future<void> _loadFleetYangu() async {
    try {
      if (widget.store.demo) throw StateError('Not available in preview mode');
      final state = await widget.store.call('logisticsFleetYanguStatus');
      if (!mounted) return;
      if (state['connected'] != true) {
        setState(() { fleetYanguState = state; fleetYanguData = null; });
        return;
      }
      final result = await widget.store.call('logisticsFleetYanguVehicles');
      if (mounted) setState(() {
        fleetYanguState = state;
        fleetYanguData = result;
      });
    } catch (e) { _notice('Fleet Yangu connection unavailable: $e'); }
  }

  Future<void> _disconnectFleetYangu() async {
    final confirmed = await showDialog<bool>(
      context: context, builder: (ctx) => AlertDialog(
        title: const Text('Disconnect Fleet Yangu?'),
        content: const Text('Workspace will stop retrieving Fleet Yangu data. '
          'Revoke the key in Fleet Yangu Admin as well to invalidate it at the source.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Cancel')),
          FilledButton(onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Disconnect')),
        ]));
    if (confirmed != true) return;
    await _action('logisticsDisconnectFleetYangu', {},
      success: 'Fleet Yangu disconnected; revoke source key too');
    if (mounted) setState(() {
      fleetYanguState = {'connected': false};
      fleetYanguData = null;
    });
  }

  Future<void> _linkFleetYangu(Map<String, dynamic> fleetVehicle) async {
    if (vehicles.isEmpty) { _notice('Register a Workspace vehicle first'); return; }
    String workspaceVehicleId = vehicles.first['id'].toString();
    final approved = await showDialog<bool>(context: context,
      builder: (ctx) => StatefulBuilder(builder: (ctx, setDialog) =>
        AlertDialog(
          title: const Text('Link Fleet Yangu vehicle'),
          content: Column(mainAxisSize: MainAxisSize.min, children: [
            Text('Fleet Yangu: ${fleetVehicle['registration']} '
              '(${fleetVehicle['fleetVehicleId']})'),
            const SizedBox(height: 10),
            DropdownButtonFormField<String>(
              initialValue: workspaceVehicleId,
              decoration: const InputDecoration(labelText: 'Workspace vehicle'),
              items: vehicles.map((v) => DropdownMenuItem<String>(
                value: v['id'].toString(),
                child: Text(v['registration']?.toString() ?? 'Vehicle'))).toList(),
              onChanged: (value) {
                if (value != null) setDialog(() => workspaceVehicleId = value);
              },
            ),
          ]),
          actions: [
            TextButton(onPressed: () => Navigator.pop(ctx, false),
              child: const Text('Cancel')),
            FilledButton(onPressed: () => Navigator.pop(ctx, true),
              child: const Text('Link vehicle')),
          ],
        )));
    if (approved != true) return;
    await _action('logisticsLinkFleetYanguVehicle', {
      'workspaceVehicleId': workspaceVehicleId,
      'fleetVehicleId': fleetVehicle['fleetVehicleId'],
    }, success: 'Fleet Yangu vehicle linked to Workspace');
    await _loadFleetYangu();
  }

  Future<void> _checkFleetYanguDispatch(Map<String, dynamic> shipment) async {
    try {
      if (widget.store.demo) throw StateError('Not available in preview mode');
      final response = await widget.store.call('logisticsFleetYanguDispatchStatus',
        {'shipmentId': shipment['id']});
      if (!mounted) return;
      _notice('Fleet Yangu dispatcher status: ${response['status']}. '
        'Workspace shipment status was not automatically changed.');
      await _refresh();
    } catch (e) {
      _notice('Cannot verify Fleet Yangu dispatch status: $e');
    }
  }

  Future<void> _handoffFleetYangu(Map<String, dynamic> shipment) async {
    final approved = await showDialog<bool>(
      context: context, builder: (ctx) => AlertDialog(
        title: const Text('Send to Fleet Yangu dispatcher?'),
        content: Text('Send booked shipment ${shipment['reference']} '
          'to the paired Fleet Yangu vehicle for review? '
          'This does not start a trip or control vehicle hardware.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Cancel')),
          FilledButton(onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Submit for fleet review')),
        ]));
    if (approved != true) return;
    await _action('logisticsSendFleetYanguDispatch', {
      'shipmentId': shipment['id'], 'confirm': true,
    }, success: 'Fleet Yangu dispatch request submitted for review');
  }

  Future<void> _assignTransport(Map<String, dynamic> shipment) async {
    if (carriers.isEmpty) {
      _notice('Register a logistics company first'); return;
    }
    String carrierId = carriers.first['id'].toString();
    String vehicleId = '';
    final tracking = TextEditingController(
        text: shipment['trackingNumber']?.toString() ?? '');
    try {
      final confirmed = await showDialog<bool>(context: context,
        builder: (ctx) => StatefulBuilder(builder: (ctx, update) => AlertDialog(
          title: const Text('Assign carrier and vehicle'),
          content: SizedBox(width: 460, child: SingleChildScrollView(
            child: Column(mainAxisSize: MainAxisSize.min, children: [
              DropdownButtonFormField<String>(
                initialValue: carrierId,
                decoration: const InputDecoration(labelText: 'Carrier'),
                items: carriers.map((c) => DropdownMenuItem<String>(
                  value: c['id'].toString(),
                  child: Text(c['company']?.toString() ?? 'Carrier'),
                )).toList(),
                onChanged: (value) { if (value != null) update(() => carrierId = value); },
              ),
              const SizedBox(height: 12),
              TextField(controller: tracking, decoration: const InputDecoration(
                labelText: 'Carrier tracking / waybill number')),
              const SizedBox(height: 12),
              DropdownButtonFormField<String>(
                initialValue: vehicleId,
                decoration: const InputDecoration(labelText: 'Fleet vehicle (optional)'),
                items: [
                  const DropdownMenuItem(value: '', child: Text('External carrier')),
                  ...vehicles.map((v) => DropdownMenuItem<String>(
                    value: v['id'].toString(),
                    child: Text(v['registration']?.toString() ?? 'Vehicle'),
                  )),
                ],
                onChanged: (value) { if (value != null) update(() => vehicleId = value); },
              ),
            ]),
          )),
          actions: [
            TextButton(onPressed: () => Navigator.pop(ctx, false),
              child: const Text('Cancel')),
            FilledButton(onPressed: () => Navigator.pop(ctx, true),
              child: const Text('Assign')),
          ],
        )));
      if (confirmed != true) return;
      await _action('logisticsAssignTransport', {
        'shipmentId': shipment['id'], 'carrierId': carrierId,
        'vehicleId': vehicleId, 'trackingNumber': tracking.text.trim(),
      }, success: 'Carrier assignment saved');
    } finally { tracking.dispose(); }
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
                          '${s['weightKg']} kg · ${s['status']} · Tracking: ${s['trackingNumber'] ?? '-'}'),
                        trailing: PopupMenuButton<String>(
                          tooltip: 'Shipment actions',
                          onSelected: (value) {
                            if (value == 'assign') { _assignTransport(s); }
                            if (value == 'fleet_yangu') { _handoffFleetYangu(s); }
                            if (value == 'fleet_yangu_status') { _checkFleetYanguDispatch(s); }
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
                            PopupMenuItem(value: 'assign', child: Text('Assign carrier / vehicle')),
                            PopupMenuItem(value: 'fleet_yangu', child: Text('Submit to Fleet Yangu')),
                            PopupMenuItem(value: 'fleet_yangu_status', child: Text('Check Fleet Yangu dispatch status')),
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
                _section('Fleet Yangu · Vehicle intelligence integration',
                  Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    const Text('Connect a Fleet Yangu organization to this Workspace '
                      'using its owner-issued 90-day key. Vehicle mappings and '
                      'dispatch permissions require explicit authorization.'),
                    const SizedBox(height: 10),
                    Wrap(spacing: 8, runSpacing: 8, children: [
                      FilledButton.icon(onPressed: _connectFleetYangu,
                        icon: const Icon(Icons.link),
                        label: const Text('Connect Fleet Yangu')),
                      OutlinedButton.icon(onPressed: _loadFleetYangu,
                        icon: const Icon(Icons.refresh),
                        label: const Text('Refresh vehicle intelligence')),
                      if (fleetYanguState?['connected'] == true)
                        OutlinedButton.icon(onPressed: _disconnectFleetYangu,
                          icon: const Icon(Icons.link_off),
                          label: const Text('Disconnect')),
                    ]),
                    const SizedBox(height: 12),
                    if (fleetYanguState != null)
                      Text(fleetYanguState?['connected'] == true
                        ? 'Paired organization: ${fleetYanguState?['sourceOrgId']}'
                        : 'Not connected'),
                    if (fleetYanguData != null) ...[
                      const SizedBox(height: 8),
                      Text('Fleet snapshot · '
                        '${(fleetYanguData!['vehicles'] as List? ?? const []).length} vehicles · '
                        'Dispatch permission: ${fleetYanguData!['dispatchAllowed'] == true ? 'enabled' : 'read only'}'),
                      ...((fleetYanguData!['vehicles'] as List? ?? const [])
                        .whereType<Map>().map((v) => ListTile(
                          leading: const Icon(Icons.monitor_heart_outlined),
                          title: Text(v['registration']?.toString() ?? 'Fleet vehicle'),
                          subtitle: Text('Health ${v['healthScore'] ?? 'not reported'}/100 · '
                            'Risk ${v['fleetRiskScore'] ?? 'not reported'}/100 · '
                            'Last telemetry ${v['lastTelemetryAt'] ?? 'unknown'} · '
                            'Workspace: ${v['workspaceVehicleId'] ?? 'not linked'}'),
                          trailing: TextButton(onPressed: () =>
                            _linkFleetYangu(Map<String, dynamic>.from(v)),
                            child: Text(v['workspaceVehicleId'] == null ? 'Link' : 'Linked')),
                        ))),
                      const SizedBox(height: 8),
                      Text('Safety alerts: ${(fleetYanguData!['alerts'] as List? ?? const []).length} · '
                        'Maintenance orders: ${(fleetYanguData!['workOrders'] as List? ?? const []).length}'),
                      const Text('Fleet Yangu snapshots are on-demand. Vehicle commands '
                        'and raw hardware telemetry are not exposed.',
                        style: TextStyle(color: Color(0xFF64748B))),
                    ],
                  ])),
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
