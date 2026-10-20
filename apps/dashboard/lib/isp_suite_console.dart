import 'package:cloud_functions/cloud_functions.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

/// Native Flutter implementation of the ISP suite. All privileged mutations
/// use existing Firebase Authentication and server-side super-admin checks.
class IspSuiteConsole extends StatefulWidget {
  const IspSuiteConsole({super.key});
  @override
  State<IspSuiteConsole> createState() => _IspSuiteConsoleState();
}

class _IspSuiteConsoleState extends State<IspSuiteConsole> {
  static const Color navy = Color(0xFF11294A);
  static const Color accent = Color(0xFF2563EB);
  final _budgetCustomers = TextEditingController(text: '50');
  final _budgetArpu = TextEditingController(text: '2000');
  final _budgetOpex = TextEditingController(text: '65000');
  final _budgetCapex = TextEditingController(text: '1029687');
  final _search = TextEditingController();
  String section = 'overview';
  bool busy = true;
  String? failure;
  Map<String, dynamic> modules = {};
  List<Map<String, dynamic>> integrations = [];
  List<Map<String, dynamic>> records = [];
  Map<String, dynamic> dashboard = {};
  List<Map<String, dynamic>> requests = [];

  FirebaseFunctions get functions =>
      FirebaseFunctions.instanceFor(region: 'europe-west1');

  Future<Map<String, dynamic>> _call(String name, [Map<String, dynamic>? data]) async {
    final result = await functions.httpsCallable(name).call(data ?? <String, dynamic>{});
    return Map<String, dynamic>.from(result.data as Map);
  }

  @override
  void initState() {
    super.initState();
    _initialize();
  }

  @override
  void dispose() {
    _budgetCustomers.dispose();
    _budgetArpu.dispose();
    _budgetOpex.dispose();
    _budgetCapex.dispose();
    _search.dispose();
    super.dispose();
  }

  List<Map<String, dynamic>> _toRows(Object? data) =>
      (data as List? ?? const []).whereType<Map>()
          .map((item) => Map<String, dynamic>.from(item)).toList();

  Future<void> _initialize() async {
    if (mounted) setState(() {busy = true; failure = null;});
    try {
      final loaded = await _call('ispSuiteCatalog');
      final summary = await _call('ispSuiteDashboard');
      if (!mounted) return;
      setState(() {
        modules = Map<String, dynamic>.from(loaded['modules'] as Map);
        integrations = _toRows(loaded['integrations']);
        dashboard = summary;
        busy = false;
      });
    } catch (e) {
      if (mounted) setState(() {failure = e.toString(); busy = false;});
    }
  }

  Future<void> _loadSection(String name) async {
    if (mounted) setState(() {section = name; busy = true; failure = null; records = [];});
    _search.clear();
    try {
      if (modules.containsKey(name)) {
        final response = await _call('ispSuiteRecords', {'module': name});
        records = _toRows(response['records']);
      } else if (name == 'requests') {
        final response = await _call('ispSuiteCustomerRequests');
        requests = _toRows(response['requests']);
      } else if (name == 'quality') {
        final response = await _call('ispSuiteRecords', {'module': 'telemetry'});
        records = _toRows(response['records']);
      } else if (name == 'overview') {
        dashboard = await _call('ispSuiteDashboard');
      }
    } catch (e) {
      failure = e.toString();
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  void _notice(String message) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(message)));
  }

  void _navigate(String name, {bool fromDrawer = false}) {
    if (fromDrawer) Navigator.of(context).pop();
    _loadSection(name);
  }

  String _label(String name) {
    if (name == 'overview') return 'Overview';
    if (name == 'architecture') return 'Network topology';
    if (name == 'integrations') return 'Integrations';
    if (name == 'economics') return 'Pilot economics';
    if (name == 'quality') return 'Network quality';
    if (name == 'requests') return 'Customer enquiries';
    return (Map<String, dynamic>.from(modules[name] as Map))['title'].toString();
  }

  IconData _icon(String name) {
    switch (name) {
      case 'overview': return Icons.dashboard_outlined;
      case 'architecture': return Icons.account_tree_outlined;
      case 'integrations': return Icons.hub_outlined;
      case 'economics': return Icons.calculate_outlined;
      case 'quality': case 'telemetry': return Icons.monitor_heart_outlined;
      case 'requests': case 'support': return Icons.support_agent_outlined;
      case 'sites': case 'outreach': return Icons.map_outlined;
      case 'devices': return Icons.router_outlined;
      case 'links': return Icons.lan_outlined;
      case 'subscribers': return Icons.people_outline;
      case 'plans': return Icons.speed_outlined;
      case 'invoices': return Icons.receipt_long_outlined;
      case 'payments': return Icons.account_balance_wallet_outlined;
      case 'provisioning': return Icons.verified_user_outlined;
      case 'firmware': return Icons.system_update_outlined;
      case 'notifications': return Icons.notifications_active_outlined;
      case 'procurement': return Icons.shopping_cart_outlined;
      case 'policies': return Icons.security_outlined;
      case 'incidents': return Icons.warning_amber_outlined;
      case 'workOrders': return Icons.handyman_outlined;
      default: return Icons.folder_outlined;
    }
  }

  Widget _menu(bool compact) {
    final categories = [
      'overview', 'architecture', 'integrations', 'quality', 'economics', 'requests',
      ...modules.keys
    ];
    return Container(
      color: navy,
      child: SafeArea(
        child: ListView(
          padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 8),
          children: [
            const Padding(
              padding: EdgeInsets.fromLTRB(12, 5, 8, 17),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text('TeknTandao ISP', style: TextStyle(color: Colors.white,
                    fontWeight: FontWeight.bold, fontSize: 21)),
                SizedBox(height: 4),
                Text('Fiber + Wireless · Operations',
                    style: TextStyle(color: Color(0xFF9BB8D8), fontSize: 12)),
              ]),
            ),
            for (final name in categories)
              ListTile(
                dense: true,
                selected: section == name,
                selectedTileColor: const Color(0xFF25446D),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                leading: Icon(_icon(name), color: Colors.white70, size: 20),
                title: Text(_label(name), style: const TextStyle(color: Colors.white, fontSize: 13)),
                onTap: () => _navigate(name, fromDrawer: compact),
              ),
          ],
        ),
      ),
    );
  }

  Widget _stat(String label, String value, String note, IconData icon) =>
      SizedBox(
        width: 210,
        child: Card(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Icon(icon, color: accent), const SizedBox(height: 9),
              Text(value, style: const TextStyle(fontSize: 27, fontWeight: FontWeight.bold)),
              Text(label, style: const TextStyle(fontWeight: FontWeight.w600)),
              Text(note, style: const TextStyle(color: Colors.black54, fontSize: 11)),
            ]),
          ),
        ),
      );

  Widget _info(String heading, String body, {IconData icon = Icons.info_outline}) =>
      Card(child: ListTile(
        leading: Icon(icon, color: accent),
        title: Text(heading, style: const TextStyle(fontWeight: FontWeight.w600)),
        subtitle: Text(body),
      ));

  Widget _overview() {
    final counts = Map<String, dynamic>.from(dashboard['counts'] as Map? ?? {});
    return ListView(children: [
      _info('Engineering pilot · not an installed customer network',
        '50 homes (32 fiber + 18 wireless), 200 Mbps shared upstream and KSh 1,029,687 estimated capital cost are planning assumptions. All external integrations remain disconnected.',
        icon: Icons.info_outline),
      const SizedBox(height: 15),
      Wrap(spacing: 9, runSpacing: 9, children: [
        _stat('Sites', '${counts['sites'] ?? 0}', 'Planning records', Icons.location_on_outlined),
        _stat('Equipment', '${counts['devices'] ?? 0}', 'Not live device status', Icons.router_outlined),
        _stat('Subscribers', '${counts['subscribers'] ?? 0}', 'Not provisioned', Icons.people_outlined),
        _stat('Incidents', '${counts['incidents'] ?? 0}', 'Manual tickets', Icons.warning_amber_outlined),
        _stat('Technician jobs', '${counts['workOrders'] ?? 0}', 'Workflow records', Icons.handyman_outlined),
        _stat('Telemetry', '${counts['telemetry'] ?? 0}', 'Manual samples', Icons.timeline_outlined),
      ]),
      const SizedBox(height: 22),
      const Text('Quick operations', style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold)),
      const SizedBox(height: 10),
      Wrap(spacing: 8, runSpacing: 8, children: [
        for (final name in ['sites', 'devices', 'subscribers', 'telemetry',
          'incidents', 'workOrders', 'invoices', 'provisioning'])
          OutlinedButton.icon(
            onPressed: () => _loadSection(name), icon: Icon(_icon(name)),
            label: Text(_label(name)),
          ),
      ]),
      const SizedBox(height: 15),
      _info('Administration scope',
          'Device management, billing and customer records are held behind the existing Firebase super-admin policy. A record or approval never activates internet service or collects money.'),
    ]);
  }

  Widget _topologyNode(String heading, String description, IconData icon) =>
      Container(
        constraints: const BoxConstraints(maxWidth: 360),
        padding: const EdgeInsets.all(17),
        decoration: BoxDecoration(
          border: Border.all(color: const Color(0xFFD9E4EF)),
          borderRadius: BorderRadius.circular(14), color: Colors.white,
        ),
        child: Row(children: [
          Icon(icon, color: accent), const SizedBox(width: 11),
          Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(heading, style: const TextStyle(fontWeight: FontWeight.bold)),
            Text(description, style: const TextStyle(fontSize: 12, color: Colors.black54)),
          ])),
        ]),
      );

  Widget _topology() => ListView(children: [
    _info('Illustrative network architecture', 'The fiber ONT/OLT, RF coverage and VLAN interoperability must be measured before deployment.'),
    const SizedBox(height: 16),
    Center(child: _topologyNode('Upstream Internet',
        '200 Mbps initial scenario', Icons.public)),
    const Center(child: Icon(Icons.arrow_downward, color: accent)),
    Center(child: _topologyNode('MikroTik RB5009 core',
        'Routing, PPPoE, firewall, RADIUS, VLAN and queues', Icons.router)),
    const Center(child: Icon(Icons.arrow_downward, color: accent)),
    Wrap(alignment: WrapAlignment.center, spacing: 12, runSpacing: 12, children: [
      _topologyNode('Fiber access branch',
          'VSOL 4-port GPON OLT → 2 × 1:16 splitters → 32 compatible ONTs (assumed)',
          Icons.cable),
      _topologyNode('Wireless distribution branch',
          '2 COMFAST bridge pairs → 2 managed switches → 18 customer routers (assumed)',
          Icons.wifi_tethering),
    ]),
    const Center(child: Icon(Icons.arrow_downward, color: accent)),
    Center(child: _topologyNode('TeknTandao control plane',
        'Firebase admin • Monitoring records • RADIUS/GenieACS integration plan • CRM and support',
        Icons.hub_outlined)),
    const SizedBox(height: 20),
    _info('Separation of responsibilities',
        'Internet access must continue if AI, billing or the customer interface becomes unavailable. Router settings and merchant tokens never belong in client-side code.'),
  ]);

  Widget _integrations() => ListView(children: [
    _info('Integration readiness',
        'These are explicit connection requirements, not working provider connections. Use limited test environments and server-held credentials.'),
    const SizedBox(height: 12),
    for (final provider in integrations)
      Card(child: ListTile(
        leading: const Icon(Icons.power_off_rounded, color: Colors.orange),
        title: Text(provider['name'].toString()),
        subtitle: const Text('Vendor configuration, credentials and staging tests required'),
        trailing: Chip(label: Text(provider['status'].toString())),
      )),
  ]);

  double _amount(TextEditingController field) => double.tryParse(field.text) ?? 0;
  Widget _moneyField(String label, TextEditingController controller) =>
      SizedBox(width: 235, child: TextField(
        controller: controller,
        keyboardType: TextInputType.number,
        onChanged: (_) => setState(() {}),
        decoration: InputDecoration(labelText: label, border: const OutlineInputBorder()),
      ));

  String _kes(num value) => 'KSh ${value.toStringAsFixed(0)}';
  Widget _economics() {
    final customers = _amount(_budgetCustomers), arpu = _amount(_budgetArpu);
    final revenue = customers * arpu, operating = _amount(_budgetOpex);
    final diff = revenue - operating, capex = _amount(_budgetCapex);
    final payback = diff > 0 ? (capex / diff).ceil().toString() : 'N/A';
    return ListView(children: [
      _info('Illustrative financial scenario',
          'These inputs are not actual quotations or payment receipts. The result is not net profit and excludes tax, financing, civil works and depreciation.'),
      const SizedBox(height: 14),
      Wrap(spacing: 14, runSpacing: 14, children: [
        _moneyField('Paying customers', _budgetCustomers),
        _moneyField('Monthly package KSh', _budgetArpu),
        _moneyField('Monthly costs KSh', _budgetOpex),
        _moneyField('Initial CAPEX KSh', _budgetCapex),
      ]),
      const SizedBox(height: 16),
      Wrap(spacing: 10, runSpacing: 10, children: [
        _stat('Monthly revenue', _kes(revenue), 'Scenario only', Icons.payments_outlined),
        _stat('Monthly operating difference', _kes(diff), 'Not net profit', Icons.trending_up),
        _stat('Simple capital payback', '$payback months', 'Ignoring tax and growth', Icons.schedule),
      ]),
      const SizedBox(height: 12),
      _info('Procurement',
          'Compare Huawei EG8145V5, TP-Link EC220-G5, MikroTik hAP ac²/ax², COMFAST bridges and compatible VSOL ONTs. Verify SNMP/MIBs, TR-069/USP, OMCI, PoE voltage, Gigabit Ethernet, VLANs, syslog, firmware and local type approval.',
          icon: Icons.shopping_bag_outlined),
    ]);
  }

  Widget _quality() {
    final sampleCount = records.length;
    final categories = <String, int>{'healthy':0, 'warning':0, 'critical':0, 'insufficient_data':0};
    for (final row in records) {
      final status = row['health']?.toString() ?? 'insufficient_data';
      categories[status] = (categories[status] ?? 0) + 1;
    }
    final valid = records.where((row) => row['utilizationPct'] is num).toList();
    return ListView(children: [
      _info('Manual data, not a live monitoring feed',
        'Diagnostic samples are operator-entered. Do not interpret the charts as network availability, customer internet speeds or predictive machine learning.'),
      const SizedBox(height: 15),
      Wrap(spacing: 10, runSpacing: 10, children: [
        _stat('Recorded readings', '$sampleCount', 'Maximum 100 loaded', Icons.analytics_outlined),
        _stat('Healthy samples', '${categories['healthy']}', 'Threshold heuristic', Icons.check_circle_outline),
        _stat('Warning samples', '${categories['warning']}', 'Review required', Icons.report_problem_outlined),
        _stat('Critical samples', '${categories['critical']}', 'Not confirmed outages', Icons.error_outline),
      ]),
      const SizedBox(height: 14),
      const Text('Link utilization samples', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 18)),
      for (final row in valid.take(30))
        Padding(padding: const EdgeInsets.symmetric(vertical: 4), child: Row(children: [
          SizedBox(width: 130, child: Text(row['site']?.toString() ?? 'Site',
              overflow: TextOverflow.ellipsis)),
          Expanded(child: LinearProgressIndicator(
            value: ((row['utilizationPct'] as num).toDouble()/100).clamp(0.0, 1.0).toDouble(),
            minHeight: 10)),
          const SizedBox(width: 12),
          SizedBox(width: 50, child: Text('${row['utilizationPct']}%')),
        ])),
    ]);
  }

  Future<void> _copyCsv() async {
    final meta = Map<String, dynamic>.from(modules[section] as Map);
    final fields = Map<String, dynamic>.from(meta['fields'] as Map);
    final keys = ['id', 'status', ...fields.keys];
    String sanitize(Object? input) {
      var s = input?.toString() ?? '';
      if (RegExp(r'^[=+@-]').hasMatch(s)) s = "'$s";
      return '"${s.replaceAll('"', '""')}"';
    }
    final csv = [
      keys.map(sanitize).join(','),
      for (final record in records) keys.map((key) => sanitize(record[key])).join(',')
    ].join('\r\n');
    await Clipboard.setData(ClipboardData(text: csv));
    _notice('Copied ${records.length} loaded records as CSV (maximum 100).');
  }

  Future<void> _createRecord() async {
    final meta = Map<String, dynamic>.from(modules[section] as Map);
    final fields = Map<String, dynamic>.from(meta['fields'] as Map);
    final values = <String, dynamic>{};
    final key = GlobalKey<FormState>();
    final success = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: Text('Add ${meta['title']} record'),
        content: SizedBox(width: 520, child: Form(
          key: key,
          child: SingleChildScrollView(child: Column(mainAxisSize: MainAxisSize.min, children: [
            for (final entry in fields.entries)
              Padding(padding: const EdgeInsets.only(bottom: 12),
                child: _input(entry.key, Map<String, dynamic>.from(entry.value as Map), values)),
          ])),
        )),
        actions: [
          TextButton(onPressed: () => Navigator.pop(dialogContext, false), child: const Text('Cancel')),
          FilledButton(onPressed: () {
            if (key.currentState?.validate() != true) return;
            key.currentState?.save();
            Navigator.pop(dialogContext, true);
          }, child: const Text('Save record')),
        ],
      ),
    );
    if (success != true) return;
    try {
      await _call('ispSuiteCreateRecord', {'module': section, 'record': values});
      _notice('Record saved. No external network or payment action was executed.');
      await _loadSection(section);
    } catch (e) { _notice('Could not save: $e'); }
  }

  Widget _input(String key, Map<String, dynamic> def, Map<String, dynamic> values) {
    final label = def['label'].toString();
    final required = def['required'] == true;
    final type = def['type'].toString();
    if (type == 'select') {
      final options = (def['values'] as List).map((e) => e.toString()).toList();
      return DropdownButtonFormField<String>(
        initialValue: options.first,
        isExpanded: true,
        decoration: InputDecoration(labelText: label, border: const OutlineInputBorder()),
        items: [for (final option in options)
          DropdownMenuItem(value: option, child: Text(option.replaceAll('_', ' ')))],
        onChanged: (_) {},
        onSaved: (value) {if (value != null) values[key] = value;},
      );
    }
    return TextFormField(
      minLines: type == 'longtext' ? 2 : 1,
      maxLines: type == 'longtext' ? 4 : 1,
      maxLength: (def['max'] as num?)?.toInt(),
      keyboardType: type == 'number' ? const TextInputType.numberWithOptions(decimal: true, signed: true) : TextInputType.text,
      decoration: InputDecoration(
        labelText: required ? '$label *' : label,
        border: const OutlineInputBorder(),
      ),
      validator: (value) {
        final v = value?.trim() ?? '';
        if (required && v.isEmpty) return 'Required';
        if (type == 'number' && v.isNotEmpty) {
          final n = num.tryParse(v);
          if (n == null) return 'Enter a number';
          final min = (def['min'] as num?)?.toDouble(), max = (def['max'] as num?)?.toDouble();
          if (min != null && n < min || max != null && n > max) return 'Outside allowed range';
        }
        return null;
      },
      onSaved: (value) {
        final v = value?.trim() ?? '';
        if (v.isEmpty) return;
        values[key] = type == 'number' ? num.parse(v) : v;
      },
    );
  }

  Future<void> _changeStatus(Map<String, dynamic> record, String next) async {
    try {
      await _call('ispSuiteChangeStatus', {
        'module': section, 'id': record['id'], 'status': next,
      });
      _notice('Status updated and audited. No device commands executed.');
      await _loadSection(section);
    } catch (e) { _notice('Status change rejected: $e'); }
  }

  Widget _moduleView() {
    final meta = Map<String, dynamic>.from(modules[section] as Map);
    final workflow = meta['workflow'] == null ? <String, dynamic>{}
        : Map<String, dynamic>.from(meta['workflow'] as Map);
    final transitions = Map<String, dynamic>.from(workflow['transitions'] as Map? ?? {});
    final filter = _search.text.toLowerCase();
    final displayed = records.where((r) => r.toString().toLowerCase().contains(filter)).toList();
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      _info(meta['title'].toString(), meta['description'].toString()),
      Padding(padding: const EdgeInsets.symmetric(vertical: 12), child: Wrap(spacing: 10, runSpacing: 7, children: [
        SizedBox(width: 240, child: TextField(
          controller: _search, onChanged: (_) => setState(() {}),
          decoration: const InputDecoration(prefixIcon: Icon(Icons.search), hintText: 'Filter loaded records',
              border: OutlineInputBorder(), isDense: true),
        )),
        OutlinedButton.icon(onPressed: _copyCsv, icon: const Icon(Icons.copy_all), label: const Text('Copy CSV')),
        FilledButton.icon(onPressed: _createRecord, icon: const Icon(Icons.add), label: const Text('Add record')),
      ])),
      Text('${displayed.length} records loaded (maximum 100). ${section == 'telemetry' ? 'Readings are manual, not live telemetry.' : 'No live device or payment actions.'}',
          style: const TextStyle(color: Colors.black54, fontSize: 12)),
      const SizedBox(height: 6),
      Expanded(child: displayed.isEmpty
        ? const Center(child: Text('No matching records.'))
        : ListView.builder(itemCount: displayed.length, itemBuilder: (context, index) {
          final row = displayed[index];
          final label = (row['label'] ?? row['title'] ?? row['name'] ?? row['accountCode'] ??
              row['invoiceCode'] ?? row['deviceId'] ?? row['id']).toString();
          final current = (row['status'] ?? row['lifecycle'] ?? 'planned').toString();
          final next = (transitions[current] as List? ?? []).map((v) => v.toString()).toList();
          final summary = row.entries
              .where((e) => !['id','createdAt','updatedAt','createdBy','updatedBy','notes','description','message','status'].contains(e.key))
              .take(4).map((e) => '${e.key}: ${e.value}').join(' · ');
          return Card(child: ListTile(
            leading: Icon(_icon(section), color: accent),
            title: Text(label, overflow: TextOverflow.ellipsis),
            subtitle: Text('$summary\nStatus: $current', maxLines: 3, overflow: TextOverflow.ellipsis),
            isThreeLine: true,
            trailing: next.isEmpty ? const Icon(Icons.info_outline, color: Colors.grey)
                : PopupMenuButton<String>(
                    tooltip: 'Update audited status',
                    onSelected: (value) => _changeStatus(row, value),
                    itemBuilder: (_) => [for (final status in next)
                      PopupMenuItem(value: status, child: Text(status.replaceAll('_',' ')))],
                  ),
          ));
        })),
    ]);
  }

  Widget _requestsView() => ListView(children: [
    _info('Consent-based service enquiries', 'Verified-email customer requests are stored for administrator review. No installation or subscription is activated.'),
    for (final row in requests)
      Card(child: ListTile(
        leading: const Icon(Icons.mail_outline),
        title: Text('${row['service']} · ${row['site']}'),
        subtitle: Text('${row['email']}\n${row['message']}', maxLines: 4),
        isThreeLine: true,
      )),
    if (requests.isEmpty) const Padding(padding: EdgeInsets.all(20), child: Text('No service requests recorded yet.')),
  ]);

  @override
  Widget build(BuildContext context) {
    final compact = MediaQuery.sizeOf(context).width < 880;
    return Scaffold(
      drawer: compact ? Drawer(child: _menu(true)) : null,
      appBar: AppBar(
        title: const Text('TeknTandao ISP Suite'),
        actions: [
          IconButton(tooltip: 'Customer request portal', icon: const Icon(Icons.contact_support_outlined),
            onPressed: () => Navigator.of(context).push(
                MaterialPageRoute<void>(builder: (_) => const IspCustomerPortal()))),
          IconButton(tooltip: 'Refresh', icon: const Icon(Icons.refresh),
            onPressed: busy ? null : () => section == 'overview' ? _initialize() : _loadSection(section)),
        ],
      ),
      body: Row(children: [
        if (!compact) SizedBox(width: 270, child: _menu(false)),
        Expanded(child: Padding(
          padding: const EdgeInsets.all(16),
          child: busy
            ? const Center(child: CircularProgressIndicator())
            : failure != null
              ? Center(child: Column(mainAxisSize: MainAxisSize.min, children: [
                  Text('ISP data unavailable: $failure', textAlign: TextAlign.center),
                  const SizedBox(height: 12),
                  FilledButton(onPressed: _initialize, child: const Text('Retry')),
                ]))
              : section == 'overview' ? _overview()
              : section == 'architecture' ? _topology()
              : section == 'integrations' ? _integrations()
              : section == 'economics' ? _economics()
              : section == 'quality' ? _quality()
              : section == 'requests' ? _requestsView()
              : _moduleView(),
        )),
      ]),
    );
  }
}

class IspCustomerPortal extends StatefulWidget {
  const IspCustomerPortal({super.key});
  @override
  State<IspCustomerPortal> createState() => _IspCustomerPortalState();
}

class _IspCustomerPortalState extends State<IspCustomerPortal> {
  final site = TextEditingController();
  final message = TextEditingController();
  String service = 'fiber_survey';
  bool consent = false;
  bool submitting = false;
  String status = '';
  static const services = {
    'fiber_survey': 'Fiber installation survey',
    'wireless_survey': 'Wireless site feasibility survey',
    'home_wifi': 'Home / office Wi-Fi consultation',
    'support_callback': 'Customer support callback'
  };

  @override
  void dispose() {
    site.dispose();
    message.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final user = FirebaseAuth.instance.currentUser;
    if (user == null) {
      setState(() => status = 'Sign in to submit a service request.');
      return;
    }
    await user.reload();
    if (!user.emailVerified) {
      setState(() => status = 'Verify your email address before submitting.');
      return;
    }
    if (!consent || site.text.trim().length < 3 || message.text.trim().length < 8) {
      setState(() => status = 'Enter a site, message and provide contact consent.');
      return;
    }
    setState(() {submitting = true; status = '';});
    try {
      await user.getIdToken(true);
      final reply = await FirebaseFunctions.instanceFor(region: 'europe-west1')
          .httpsCallable('ispSuiteCustomerRequest').call({
            'site': site.text.trim(), 'service': service,
            'message': message.text.trim(), 'consent': true,
          });
      final data = Map<String, dynamic>.from(reply.data as Map);
      setState(() => status = 'Request received: ${data['id']}. This does not activate service.');
    } catch (e) {
      setState(() => status = 'Request was not submitted: $e');
    } finally {
      if (mounted) setState(() => submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('TeknTandao · ISP service requests')),
    body: Center(child: ConstrainedBox(
      constraints: const BoxConstraints(maxWidth: 650),
      child: ListView(padding: const EdgeInsets.all(22), children: [
        const Icon(Icons.wifi_tethering, size: 54, color: Color(0xFF2563EB)),
        const SizedBox(height: 15),
        const Text('Fiber, wireless and managed Wi-Fi',
            style: TextStyle(fontSize: 26, fontWeight: FontWeight.bold)),
        const SizedBox(height: 9),
        const Text('Request a site assessment or support callback. Network availability, pricing and installation are subject to survey and confirmation.'),
        const SizedBox(height: 22),
        TextField(controller: site, maxLength: 120, decoration: const InputDecoration(
            labelText: 'Site / estate / general neighborhood', border: OutlineInputBorder())),
        const SizedBox(height: 12),
        DropdownButtonFormField<String>(
          initialValue: service,
          decoration: const InputDecoration(labelText: 'Service', border: OutlineInputBorder()),
          items: [for (final item in services.entries)
            DropdownMenuItem(value: item.key, child: Text(item.value))],
          onChanged: (value) => setState(() => service = value ?? service),
        ),
        const SizedBox(height: 12),
        TextField(controller: message, maxLength: 800, maxLines: 4,
          decoration: const InputDecoration(labelText: 'Briefly describe your request',
              border: OutlineInputBorder())),
        CheckboxListTile(
          value: consent,
          onChanged: (value) => setState(() => consent = value ?? false),
          title: const Text('I agree to be contacted about this enquiry.'),
          subtitle: const Text('Do not include router passwords, account PINs or payment credentials.'),
          contentPadding: EdgeInsets.zero,
        ),
        FilledButton.icon(
          onPressed: submitting ? null : _submit,
          icon: const Icon(Icons.send_outlined),
          label: Text(submitting ? 'Submitting...' : 'Send service request'),
        ),
        if (status.isNotEmpty) Padding(
          padding: const EdgeInsets.only(top: 14),
          child: Text(status, style: const TextStyle(fontWeight: FontWeight.w600))),
        const SizedBox(height: 16),
        const Text('Requests are limited to three per verified account per day. No automatic installation, payment, WhatsApp message or provisioning occurs.',
            style: TextStyle(color: Colors.black54, fontSize: 12)),
      ]),
    )),
  );
}
