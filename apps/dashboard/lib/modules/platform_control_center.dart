import 'dart:convert';

import 'package:flutter/material.dart';
import '../suite.dart';

class PlatformControlCenterScreen extends StatefulWidget {
  final SuiteModule module;
  final SuiteStore store;

  const PlatformControlCenterScreen({
    super.key,
    required this.module,
    required this.store,
  });

  static const supportedModuleIds = <String>{
    'mc10_business_process_marketplace',
    'mc11_ai_finops_and_model_cost_manager',
    'mc11_business_graph',
    'mc30_agent_control_center',
    'mc30_autonomous_operations_center',
  };

  static bool supports(String moduleId) => supportedModuleIds.contains(moduleId);

  @override
  State<PlatformControlCenterScreen> createState() =>
      _PlatformControlCenterScreenState();
}

class _PlatformControlCenterScreenState
    extends State<PlatformControlCenterScreen> {
  Map<String, dynamic> _overview = const {};
  Map<String, dynamic> _rails = const {};
  Map<String, dynamic> _marketplace = const {};
  Map<String, dynamic> _finOps = const {};
  Map<String, dynamic> _packs = const {};
  bool _loading = true;
  String? _error;

  SuiteStore get store => widget.store;

  int get _initialTab {
    switch (widget.module.id) {
      case 'mc11_business_graph':
        return 1;
      case 'mc10_business_process_marketplace':
        return 2;
      case 'mc30_agent_control_center':
        return 3;
      case 'mc11_ai_finops_and_model_cost_manager':
        return 4;
      default:
        return 0;
    }
  }

  @override
  void initState() {
    super.initState();
    _refresh();
  }

  Future<void> _refresh() async {
    if (!mounted) return;
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      if (store.demo) {
        _overview = {
          'counts': {
            'businessGraphNodes': 6,
            'businessGraphEdges': 8,
            'automationRules': 3,
            'automationRuns': 14,
            'agents': 2,
            'agentApprovals': 1,
            'syncReceipts': 4,
            'aiUsage': 12,
          },
          'pendingApprovals': 1,
          'openSyncConflicts': 1,
          'safeAgentActions': [
            'record.create',
            'task.create',
            'event.publish',
            'graph.upsert',
          ],
        };
        _rails = {
          'mpesaSubscriptionBilling': {
            'state': 'implemented',
            'notes': 'Verified subscription billing when Daraja credentials are configured.',
          },
          'paystackSubscriptionBilling': {
            'state': 'implemented',
            'notes': 'Verified subscription billing when production credentials are configured.',
          },
          'mpesaMerchantCheckout': {
            'state': 'blocked_external_and_engineering',
            'notes': 'Merchant reconciliation, refunds, reversals and disputes still require production integration.',
          },
          'kraEtimsFiscalization': {
            'state': 'blocked_certification',
            'notes': 'OSCU/VSCU provisioning and KRA acceptance testing are required.',
          },
        };
        _marketplace = {
          'templates': [
            {'id': 'retail_low_stock_replenishment', 'name': 'Retail low-stock replenishment', 'category': 'Retail', 'description': 'Low stock → procurement request'},
            {'id': 'property_maintenance_dispatch', 'name': 'Property maintenance dispatch', 'category': 'Property', 'description': 'Maintenance request → field-service dispatch'},
            {'id': 'logistics_delivery_followup', 'name': 'Delivery customer follow-up', 'category': 'Logistics', 'description': 'Delivery confirmation → CRM follow-up'},
            {'id': 'mining_sample_review', 'name': 'Mining sample intelligence review', 'category': 'Mining', 'description': 'Sample collection → intelligence review'},
            {'id': 'ecommerce_customer_followup', 'name': 'E-commerce post-purchase follow-up', 'category': 'Retail', 'description': 'Fulfilled order → CRM follow-up'},
          ],
          'installedTemplates': <String, dynamic>{},
        };
        _packs = {
          'packs': {
            'retail': {'name': 'Retail Operating Pack', 'offlineCritical': true},
            'sacco': {'name': 'SACCO & Cooperative Operating Pack', 'offlineCritical': true},
            'property': {'name': 'Property Operating Pack', 'offlineCritical': false},
            'mining': {'name': 'Mining Intelligence Operating Pack', 'offlineCritical': true},
            'logistics': {'name': 'Logistics Operating Pack', 'offlineCritical': true},
          },
        };
        _finOps = {
          'period': 'Demo',
          'warnPercent': 80,
          'summary': {
            'requests': 12,
            'inputTokens': 18400,
            'outputTokens': 3200,
            'cachedTokens': 4100,
            'costMinor': 2850,
            'budgetMinor': 10000,
            'remainingMinor': 7150,
            'percentUsed': 28.5,
            'byProvider': {
              'openai': {'requests': 8, 'costMinor': 2100},
              'google': {'requests': 4, 'costMinor': 750},
            },
          },
        };
      } else {
        final results = await Future.wait([
          store.call('getControlPlaneOverview'),
          store.call('getAfricanRailsReadiness'),
          store.call('getProcessMarketplace'),
          store.call('getAiFinOpsSummary'),
          store.call('getVerticalOperatingPacks'),
        ]);
        _overview = results[0];
        _rails = results[1];
        _marketplace = results[2];
        _finOps = results[3];
        _packs = results[4];
      }
    } catch (error) {
      _error = error.toString();
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _call(String name, Map<String, dynamic> data) async {
    try {
      if (store.demo) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Preview mode: production mutation was not sent.')),
        );
        return;
      }
      await store.call(name, data);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Saved successfully.')),
      );
      await _refresh();
    } catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(error.toString())),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return DefaultTabController(
      length: 6,
      initialIndex: _initialTab,
      child: Scaffold(
        appBar: AppBar(
          title: Row(
            children: [
              Icon(widget.module.icon, color: widget.module.color),
              const SizedBox(width: 10),
              Expanded(child: Text(widget.module.name)),
            ],
          ),
          actions: [
            IconButton(
              onPressed: _refresh,
              tooltip: 'Refresh',
              icon: const Icon(Icons.refresh_rounded),
            ),
          ],
          bottom: const TabBar(
            isScrollable: true,
            tabs: [
              Tab(icon: Icon(Icons.dashboard_customize_rounded), text: 'Overview'),
              Tab(icon: Icon(Icons.hub_rounded), text: 'Business Graph'),
              Tab(icon: Icon(Icons.account_tree_rounded), text: 'Automations'),
              Tab(icon: Icon(Icons.smart_toy_rounded), text: 'Agents'),
              Tab(icon: Icon(Icons.query_stats_rounded), text: 'AI FinOps'),
              Tab(icon: Icon(Icons.sync_problem_rounded), text: 'Sync'),
            ],
          ),
        ),
        body: _loading
            ? const Center(child: CircularProgressIndicator())
            : _error != null
                ? _errorState()
                : TabBarView(
                    children: [
                      _overviewTab(),
                      _graphTab(),
                      _automationTab(),
                      _agentsTab(),
                      _finOpsTab(),
                      _syncTab(),
                    ],
                  ),
      ),
    );
  }

  Widget _errorState() => Center(
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.admin_panel_settings_outlined, size: 48),
              const SizedBox(height: 12),
              const Text(
                'The control plane requires organization-owner access.',
                textAlign: TextAlign.center,
                style: TextStyle(fontWeight: FontWeight.bold),
              ),
              const SizedBox(height: 8),
              Text(_error!, textAlign: TextAlign.center),
              const SizedBox(height: 16),
              FilledButton.icon(
                onPressed: _refresh,
                icon: const Icon(Icons.refresh_rounded),
                label: const Text('Retry'),
              ),
            ],
          ),
        ),
      );

  Widget _overviewTab() {
    final counts = Map<String, dynamic>.from(_overview['counts'] as Map? ?? const {});
    final packs = Map<String, dynamic>.from(_packs['packs'] as Map? ?? const {});
    return ListView(
      padding: const EdgeInsets.all(24),
      children: [
        Text(
          'Autonomous Business OS control plane',
          style: Theme.of(context).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.bold),
        ),
        const SizedBox(height: 8),
        const Text(
          'One governed layer for graph relationships, events, automations, AI agents, offline reconciliation and African production-readiness gates.',
        ),
        const SizedBox(height: 20),
        Wrap(
          spacing: 12,
          runSpacing: 12,
          children: [
            _metric('Graph nodes', counts['businessGraphNodes'] ?? 0, Icons.hub_rounded),
            _metric('Automations', counts['automationRules'] ?? 0, Icons.account_tree_rounded),
            _metric('Agents', counts['agents'] ?? 0, Icons.smart_toy_rounded),
            _metric('Pending approvals', _overview['pendingApprovals'] ?? 0, Icons.approval_rounded),
            _metric('Sync conflicts', _overview['openSyncConflicts'] ?? 0, Icons.sync_problem_rounded),
          ],
        ),
        const SizedBox(height: 24),
        _sectionTitle('African rails readiness'),
        const SizedBox(height: 8),
        ..._rails.entries.map((entry) {
          final value = Map<String, dynamic>.from(entry.value as Map? ?? const {});
          final state = (value['state'] ?? 'unknown').toString();
          return Card(
            child: ListTile(
              leading: Icon(_stateIcon(state)),
              title: Text(_humanize(entry.key)),
              subtitle: Text(value['notes']?.toString() ?? ''),
              trailing: _stateChip(state),
            ),
          );
        }),
        const SizedBox(height: 24),
        _sectionTitle('Deep vertical operating packs'),
        const SizedBox(height: 8),
        Wrap(
          spacing: 12,
          runSpacing: 12,
          children: packs.entries.map((entry) {
            final value = Map<String, dynamic>.from(entry.value as Map? ?? const {});
            return SizedBox(
              width: 280,
              child: Card(
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        value['name']?.toString() ?? _humanize(entry.key),
                        style: const TextStyle(fontWeight: FontWeight.bold),
                      ),
                      const SizedBox(height: 6),
                      Text(
                        value['offlineCritical'] == true
                            ? 'Offline/edge operation is critical.'
                            : 'Primarily connected operation.',
                      ),
                    ],
                  ),
                ),
              ),
            );
          }).toList(),
        ),
      ],
    );
  }

  Widget _graphTab() => StreamBuilder<List<Map<String, dynamic>>>(
        stream: store.watch('businessGraphNodes'),
        builder: (context, nodeSnapshot) => StreamBuilder<List<Map<String, dynamic>>>(
          stream: store.watch('businessGraphEdges'),
          builder: (context, edgeSnapshot) {
            final nodes = nodeSnapshot.data ?? const <Map<String, dynamic>>[];
            final edges = edgeSnapshot.data ?? const <Map<String, dynamic>>[];
            return ListView(
              padding: const EdgeInsets.all(24),
              children: [
                Row(
                  children: [
                    Expanded(child: _sectionTitle('Business Graph')),
                    OutlinedButton.icon(
                      onPressed: _createGraphNode,
                      icon: const Icon(Icons.add_circle_outline),
                      label: const Text('Add node'),
                    ),
                    const SizedBox(width: 8),
                    FilledButton.icon(
                      onPressed: nodes.length < 2 ? null : () => _linkGraphNodes(nodes),
                      icon: const Icon(Icons.link_rounded),
                      label: const Text('Link nodes'),
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                Text('${nodes.length} nodes · ${edges.length} relationships'),
                const SizedBox(height: 16),
                if (nodes.isEmpty)
                  const Card(
                    child: Padding(
                      padding: EdgeInsets.all(20),
                      child: Text('No graph nodes yet. Add a customer, supplier, product, asset or other business entity.'),
                    ),
                  )
                else
                  ...nodes.take(100).map((node) {
                    final nodeId = node['nodeId']?.toString() ?? node['id']?.toString() ?? '';
                    final related = edges.where((edge) => edge['from'] == nodeId || edge['to'] == nodeId).length;
                    return Card(
                      child: ListTile(
                        leading: const CircleAvatar(child: Icon(Icons.hub_rounded)),
                        title: Text(node['label']?.toString() ?? nodeId),
                        subtitle: Text('${node['type'] ?? 'entity'} · ${node['sourceApp'] ?? 'unknown app'}'),
                        trailing: Text('$related links'),
                      ),
                    );
                  }),
              ],
            );
          },
        ),
      );

  Widget _automationTab() {
    final templates = List<Map<String, dynamic>>.from(
      (_marketplace['templates'] as List? ?? const []).map((item) => Map<String, dynamic>.from(item as Map)),
    );
    final installed = Map<String, dynamic>.from(_marketplace['installedTemplates'] as Map? ?? const {});
    return StreamBuilder<List<Map<String, dynamic>>>(
      stream: store.watch('automationRules'),
      builder: (context, snapshot) {
        final rules = snapshot.data ?? const <Map<String, dynamic>>[];
        return ListView(
          padding: const EdgeInsets.all(24),
          children: [
            Row(
              children: [
                Expanded(child: _sectionTitle('Business Process Marketplace')),
                FilledButton.icon(
                  onPressed: _createAutomationRule,
                  icon: const Icon(Icons.add_rounded),
                  label: const Text('Custom rule'),
                ),
              ],
            ),
            const SizedBox(height: 8),
            const Text('Install reusable cross-app processes or create a bounded custom automation.'),
            const SizedBox(height: 16),
            ...templates.map((template) {
              final id = template['id'].toString();
              final isInstalled = installed.containsKey(id) || rules.any((rule) => rule['templateId'] == id);
              return Card(
                child: ListTile(
                  leading: const Icon(Icons.extension_rounded),
                  title: Text(template['name']?.toString() ?? id),
                  subtitle: Text('${template['category'] ?? ''} · ${template['description'] ?? ''}'),
                  trailing: isInstalled
                      ? OutlinedButton(
                          onPressed: () => _call('uninstallProcessTemplate', {'templateId': id}),
                          child: const Text('Remove'),
                        )
                      : FilledButton(
                          onPressed: () => _call('installProcessTemplate', {'templateId': id}),
                          child: const Text('Install'),
                        ),
                ),
              );
            }),
            const SizedBox(height: 24),
            _sectionTitle('Installed automation rules'),
            const SizedBox(height: 8),
            if (rules.isEmpty)
              const Card(child: Padding(padding: EdgeInsets.all(20), child: Text('No automation rules installed yet.')))
            else
              ...rules.map((rule) => Card(
                    child: ListTile(
                      leading: Icon(rule['enabled'] == false ? Icons.pause_circle_outline : Icons.play_circle_outline),
                      title: Text(rule['name']?.toString() ?? rule['id']?.toString() ?? 'Automation'),
                      subtitle: Text('Trigger: ${rule['triggerEvent'] ?? 'unknown'}${rule['templateId'] != null ? ' · Marketplace template' : ''}'),
                    ),
                  )),
          ],
        );
      },
    );
  }

  Widget _agentsTab() => StreamBuilder<List<Map<String, dynamic>>>(
        stream: store.watch('agents'),
        builder: (context, agentSnapshot) => StreamBuilder<List<Map<String, dynamic>>>(
          stream: store.watch('agentApprovals'),
          builder: (context, approvalSnapshot) {
            final agents = agentSnapshot.data ?? const <Map<String, dynamic>>[];
            final approvals = (approvalSnapshot.data ?? const <Map<String, dynamic>>[])
                .where((item) => item['state'] == 'pending')
                .toList();
            return ListView(
              padding: const EdgeInsets.all(24),
              children: [
                Row(
                  children: [
                    Expanded(child: _sectionTitle('Agent Control Center')),
                    FilledButton.icon(
                      onPressed: _createAgentPolicy,
                      icon: const Icon(Icons.add_rounded),
                      label: const Text('New agent policy'),
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                const Text('Agents receive explicit app scopes, action scopes, cost budgets and human-approval gates.'),
                const SizedBox(height: 16),
                if (agents.isEmpty)
                  const Card(child: Padding(padding: EdgeInsets.all(20), child: Text('No governed agents configured yet.')))
                else
                  ...agents.map((agent) {
                    final policy = Map<String, dynamic>.from(agent['policy'] as Map? ?? const {});
                    final apps = (policy['allowedApps'] as List? ?? const []).join(', ');
                    final actions = (policy['allowedActions'] as List? ?? const []).join(', ');
                    return Card(
                      child: ListTile(
                        leading: const CircleAvatar(child: Icon(Icons.smart_toy_rounded)),
                        title: Text(agent['displayName']?.toString() ?? agent['agentId']?.toString() ?? 'Agent'),
                        subtitle: Text('Apps: $apps\nActions: $actions'),
                        isThreeLine: true,
                        trailing: policy['active'] == false ? const Chip(label: Text('Disabled')) : const Chip(label: Text('Active')),
                      ),
                    );
                  }),
                const SizedBox(height: 24),
                _sectionTitle('Pending human approvals'),
                const SizedBox(height: 8),
                if (approvals.isEmpty)
                  const Card(child: Padding(padding: EdgeInsets.all(20), child: Text('No agent actions are waiting for approval.')))
                else
                  ...approvals.map((approval) => Card(
                        child: ListTile(
                          title: Text('${approval['agentId'] ?? 'Agent'} · ${approval['action'] ?? 'action'}'),
                          subtitle: Text('App: ${approval['appId'] ?? ''} · Estimated cost: ${_money(approval['estimatedCostMinor'])}'),
                          trailing: Wrap(
                            spacing: 8,
                            children: [
                              TextButton(
                                onPressed: () => _call('approveAgentAction', {'requestId': approval['requestId'], 'approved': false}),
                                child: const Text('Reject'),
                              ),
                              FilledButton(
                                onPressed: () => _call('approveAgentAction', {'requestId': approval['requestId'], 'approved': true}),
                                child: const Text('Approve'),
                              ),
                            ],
                          ),
                        ),
                      )),
              ],
            );
          },
        ),
      );

  Widget _finOpsTab() {
    final summary = Map<String, dynamic>.from(_finOps['summary'] as Map? ?? const {});
    final providers = Map<String, dynamic>.from(summary['byProvider'] as Map? ?? const {});
    final percent = (summary['percentUsed'] as num?)?.toDouble() ?? 0;
    return ListView(
      padding: const EdgeInsets.all(24),
      children: [
        Row(
          children: [
            Expanded(child: _sectionTitle('AI FinOps & Model Cost Manager')),
            OutlinedButton.icon(
              onPressed: _recordAiUsage,
              icon: const Icon(Icons.add_chart_rounded),
              label: const Text('Ingest usage'),
            ),
            const SizedBox(width: 8),
            FilledButton.icon(
              onPressed: _setAiBudget,
              icon: const Icon(Icons.savings_outlined),
              label: const Text('Set budget'),
            ),
          ],
        ),
        const SizedBox(height: 8),
        Text('Period: ${_finOps['period'] ?? ''} · Warning threshold: ${_finOps['warnPercent'] ?? 80}%'),
        const SizedBox(height: 16),
        Wrap(
          spacing: 12,
          runSpacing: 12,
          children: [
            _metric('AI requests', summary['requests'] ?? 0, Icons.auto_awesome_rounded),
            _metric('Spend', _money(summary['costMinor']), Icons.payments_outlined),
            _metric('Budget remaining', _money(summary['remainingMinor']), Icons.savings_outlined),
            _metric('Input tokens', summary['inputTokens'] ?? 0, Icons.input_rounded),
            _metric('Output tokens', summary['outputTokens'] ?? 0, Icons.output_rounded),
          ],
        ),
        const SizedBox(height: 16),
        LinearProgressIndicator(value: percent <= 0 ? 0 : (percent / 100).clamp(0, 1)),
        const SizedBox(height: 6),
        Text('${percent.toStringAsFixed(1)}% of monthly AI budget used'),
        const SizedBox(height: 24),
        _sectionTitle('Provider spend'),
        const SizedBox(height: 8),
        if (providers.isEmpty)
          const Card(child: Padding(padding: EdgeInsets.all(20), child: Text('No AI usage has been ingested for this period.')))
        else
          ...providers.entries.map((entry) {
            final value = Map<String, dynamic>.from(entry.value as Map? ?? const {});
            return Card(
              child: ListTile(
                leading: const Icon(Icons.memory_rounded),
                title: Text(entry.key),
                subtitle: Text('${value['requests'] ?? 0} requests'),
                trailing: Text(_money(value['costMinor'])),
              ),
            );
          }),
        const SizedBox(height: 16),
        const Text(
          'Usage ingestion is ready for provider adapters. It does not invent live OpenAI/Gemini/Anthropic billing data; provider hooks must submit verified usage records.',
          style: TextStyle(color: Color(0xFF64748B)),
        ),
      ],
    );
  }

  Widget _syncTab() => StreamBuilder<List<Map<String, dynamic>>>(
        stream: store.watch('syncReceipts'),
        builder: (context, snapshot) {
          final receipts = snapshot.data ?? const <Map<String, dynamic>>[];
          final conflicts = receipts.where((item) => item['status'] == 'conflict').toList();
          return ListView(
            padding: const EdgeInsets.all(24),
            children: [
              _sectionTitle('Offline / edge reconciliation'),
              const SizedBox(height: 8),
              const Text('Conflicting offline writes never silently overwrite a newer server record. Resolve them explicitly here.'),
              const SizedBox(height: 16),
              if (conflicts.isEmpty)
                const Card(child: Padding(padding: EdgeInsets.all(20), child: Text('No unresolved sync conflicts.')))
              else
                ...conflicts.map((conflict) {
                  final id = conflict['id']?.toString() ?? '';
                  final parsed = _parseReceiptId(id);
                  return Card(
                    child: ListTile(
                      leading: const Icon(Icons.sync_problem_rounded),
                      title: Text('Record ${conflict['recordId'] ?? ''}'),
                      subtitle: Text('Server version ${conflict['serverVersion'] ?? 0} · ${parsed.$1}'),
                      trailing: Wrap(
                        spacing: 8,
                        children: [
                          OutlinedButton(
                            onPressed: parsed.$1.isEmpty ? null : () => _resolveConflict(conflict, parsed.$1, parsed.$2, false),
                            child: const Text('Keep server'),
                          ),
                          FilledButton(
                            onPressed: parsed.$1.isEmpty ? null : () => _resolveConflict(conflict, parsed.$1, parsed.$2, true),
                            child: const Text('Apply client data'),
                          ),
                        ],
                      ),
                    ),
                  );
                }),
            ],
          );
        },
      );

  Future<void> _createGraphNode() async {
    final entity = TextEditingController();
    final label = TextEditingController();
    final app = TextEditingController(text: 'crm');
    var type = 'customer';
    final result = await showDialog<Map<String, dynamic>>(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, setDialogState) => AlertDialog(
          title: const Text('Add graph node'),
          content: SizedBox(
            width: 520,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                DropdownButtonFormField<String>(
                  initialValue: type,
                  decoration: const InputDecoration(labelText: 'Entity type', border: OutlineInputBorder()),
                  items: const ['organization','customer','supplier','employee','member','product','order','invoice','payment','asset','contract','project','property','location','shipment','vehicle','site','sample','equipment','task','agent']
                      .map((value) => DropdownMenuItem(value: value, child: Text(value)))
                      .toList(),
                  onChanged: (value) => setDialogState(() => type = value ?? type),
                ),
                const SizedBox(height: 12),
                TextField(controller: entity, decoration: const InputDecoration(labelText: 'Entity ID', border: OutlineInputBorder())),
                const SizedBox(height: 12),
                TextField(controller: label, decoration: const InputDecoration(labelText: 'Label', border: OutlineInputBorder())),
                const SizedBox(height: 12),
                TextField(controller: app, decoration: const InputDecoration(labelText: 'Source app ID', border: OutlineInputBorder())),
              ],
            ),
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(context), child: const Text('Cancel')),
            FilledButton(
              onPressed: () => Navigator.pop(context, {'type': type, 'entityId': entity.text.trim(), 'label': label.text.trim(), 'sourceApp': app.text.trim(), 'attributes': <String, dynamic>{}}),
              child: const Text('Create'),
            ),
          ],
        ),
      ),
    );
    entity.dispose();
    label.dispose();
    app.dispose();
    if (result != null && result['entityId'].toString().isNotEmpty && result['label'].toString().isNotEmpty) {
      await _call('upsertBusinessGraphNode', {'node': result});
    }
  }

  Future<void> _linkGraphNodes(List<Map<String, dynamic>> nodes) async {
    String from = (nodes.first['nodeId'] ?? nodes.first['id']).toString();
    String to = (nodes[1]['nodeId'] ?? nodes[1]['id']).toString();
    final relation = TextEditingController(text: 'related_to');
    final app = TextEditingController(text: nodes.first['sourceApp']?.toString() ?? 'crm');
    final result = await showDialog<Map<String, dynamic>>(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, setDialogState) => AlertDialog(
          title: const Text('Link graph nodes'),
          content: SizedBox(
            width: 560,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                DropdownButtonFormField<String>(
                  initialValue: from,
                  isExpanded: true,
                  decoration: const InputDecoration(labelText: 'From', border: OutlineInputBorder()),
                  items: nodes.map((node) {
                    final id = (node['nodeId'] ?? node['id']).toString();
                    return DropdownMenuItem(value: id, child: Text(node['label']?.toString() ?? id));
                  }).toList(),
                  onChanged: (value) => setDialogState(() => from = value ?? from),
                ),
                const SizedBox(height: 12),
                DropdownButtonFormField<String>(
                  initialValue: to,
                  isExpanded: true,
                  decoration: const InputDecoration(labelText: 'To', border: OutlineInputBorder()),
                  items: nodes.map((node) {
                    final id = (node['nodeId'] ?? node['id']).toString();
                    return DropdownMenuItem(value: id, child: Text(node['label']?.toString() ?? id));
                  }).toList(),
                  onChanged: (value) => setDialogState(() => to = value ?? to),
                ),
                const SizedBox(height: 12),
                TextField(controller: relation, decoration: const InputDecoration(labelText: 'Relation', border: OutlineInputBorder())),
                const SizedBox(height: 12),
                TextField(controller: app, decoration: const InputDecoration(labelText: 'Source app ID', border: OutlineInputBorder())),
              ],
            ),
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(context), child: const Text('Cancel')),
            FilledButton(
              onPressed: () => Navigator.pop(context, {'from': from, 'to': to, 'relation': relation.text.trim(), 'sourceApp': app.text.trim(), 'attributes': <String, dynamic>{}}),
              child: const Text('Link'),
            ),
          ],
        ),
      ),
    );
    relation.dispose();
    app.dispose();
    if (result != null && result['from'] != result['to']) {
      await _call('linkBusinessGraphNodes', {'edge': result});
    }
  }

  Future<void> _createAutomationRule() async {
    final name = TextEditingController();
    final trigger = TextEditingController(text: 'crm.followup_requested');
    final target = TextEditingController(text: 'crm');
    final title = TextEditingController(text: 'Automated follow-up');
    var actionType = 'createRecord';
    final result = await showDialog<Map<String, dynamic>>(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, setDialogState) => AlertDialog(
          title: const Text('Create bounded automation'),
          content: SizedBox(
            width: 560,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                TextField(controller: name, decoration: const InputDecoration(labelText: 'Rule name', border: OutlineInputBorder())),
                const SizedBox(height: 12),
                TextField(controller: trigger, decoration: const InputDecoration(labelText: 'Trigger event', border: OutlineInputBorder())),
                const SizedBox(height: 12),
                DropdownButtonFormField<String>(
                  initialValue: actionType,
                  decoration: const InputDecoration(labelText: 'Action', border: OutlineInputBorder()),
                  items: const [
                    DropdownMenuItem(value: 'createRecord', child: Text('Create app record')),
                    DropdownMenuItem(value: 'createTask', child: Text('Create CRM task')),
                  ],
                  onChanged: (value) => setDialogState(() => actionType = value ?? actionType),
                ),
                const SizedBox(height: 12),
                if (actionType == 'createRecord')
                  TextField(controller: target, decoration: const InputDecoration(labelText: 'Target app ID', border: OutlineInputBorder())),
                if (actionType == 'createRecord') const SizedBox(height: 12),
                TextField(controller: title, decoration: const InputDecoration(labelText: 'Created record/task title', border: OutlineInputBorder())),
              ],
            ),
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(context), child: const Text('Cancel')),
            FilledButton(
              onPressed: () {
                final action = actionType == 'createTask'
                    ? {'type': 'createTask', 'title': title.text.trim()}
                    : {
                        'type': 'createRecord',
                        'targetApp': target.text.trim(),
                        'fields': {'title': title.text.trim(), 'status': 'NEW'},
                      };
                Navigator.pop(context, {
                  'name': name.text.trim(),
                  'enabled': true,
                  'triggerEvent': trigger.text.trim(),
                  'conditions': <dynamic>[],
                  'actions': [action],
                });
              },
              child: const Text('Save rule'),
            ),
          ],
        ),
      ),
    );
    name.dispose();
    trigger.dispose();
    target.dispose();
    title.dispose();
    if (result != null && result['name'].toString().isNotEmpty) {
      await _call('saveAutomationRule', {'rule': result});
    }
  }

  Future<void> _createAgentPolicy() async {
    final id = TextEditingController();
    final name = TextEditingController();
    final apps = TextEditingController(text: 'crm');
    final actions = TextEditingController(text: 'record.create,event.publish,graph.upsert');
    final approvals = TextEditingController(text: 'record.create');
    final budget = TextEditingController(text: '1000');
    final result = await showDialog<Map<String, dynamic>>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Create agent policy'),
        content: SizedBox(
          width: 600,
          child: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                TextField(controller: id, decoration: const InputDecoration(labelText: 'Agent ID', hintText: 'inventory_agent', border: OutlineInputBorder())),
                const SizedBox(height: 12),
                TextField(controller: name, decoration: const InputDecoration(labelText: 'Display name', border: OutlineInputBorder())),
                const SizedBox(height: 12),
                TextField(controller: apps, decoration: const InputDecoration(labelText: 'Allowed app IDs (comma separated)', border: OutlineInputBorder())),
                const SizedBox(height: 12),
                TextField(controller: actions, decoration: const InputDecoration(labelText: 'Allowed actions', border: OutlineInputBorder())),
                const SizedBox(height: 12),
                TextField(controller: approvals, decoration: const InputDecoration(labelText: 'Actions requiring approval', border: OutlineInputBorder())),
                const SizedBox(height: 12),
                TextField(controller: budget, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'Monthly AI/action budget (KES)', border: OutlineInputBorder())),
              ],
            ),
          ),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context), child: const Text('Cancel')),
          FilledButton(
            onPressed: () {
              List<String> split(TextEditingController controller) => controller.text.split(',').map((value) => value.trim()).where((value) => value.isNotEmpty).toList();
              Navigator.pop(context, {
                'agentId': id.text.trim(),
                'displayName': name.text.trim(),
                'policy': {
                  'active': true,
                  'allowedApps': split(apps),
                  'allowedActions': split(actions),
                  'approvalRequiredActions': split(approvals),
                  'monthlyBudgetMinor': ((double.tryParse(budget.text.trim()) ?? 0) * 100).round(),
                },
              });
            },
            child: const Text('Create policy'),
          ),
        ],
      ),
    );
    id.dispose();
    name.dispose();
    apps.dispose();
    actions.dispose();
    approvals.dispose();
    budget.dispose();
    if (result != null && result['agentId'].toString().isNotEmpty && result['displayName'].toString().isNotEmpty) {
      await _call('saveAgentPolicy', result);
    }
  }

  Future<void> _setAiBudget() async {
    final budget = TextEditingController();
    final warning = TextEditingController(text: '80');
    final result = await showDialog<Map<String, dynamic>>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('AI monthly budget'),
        content: SizedBox(
          width: 440,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(controller: budget, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'Budget (KES)', border: OutlineInputBorder())),
              const SizedBox(height: 12),
              TextField(controller: warning, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'Warning threshold %', border: OutlineInputBorder())),
            ],
          ),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context), child: const Text('Cancel')),
          FilledButton(
            onPressed: () => Navigator.pop(context, {
              'monthlyBudgetMinor': ((double.tryParse(budget.text.trim()) ?? 0) * 100).round(),
              'warnPercent': int.tryParse(warning.text.trim()) ?? 80,
            }),
            child: const Text('Save budget'),
          ),
        ],
      ),
    );
    budget.dispose();
    warning.dispose();
    if (result != null) await _call('saveAiFinOpsBudget', result);
  }

  Future<void> _recordAiUsage() async {
    final requestId = TextEditingController(text: 'req_${DateTime.now().millisecondsSinceEpoch}');
    final provider = TextEditingController(text: 'openai');
    final model = TextEditingController();
    final app = TextEditingController(text: 'analytics');
    final input = TextEditingController(text: '0');
    final output = TextEditingController(text: '0');
    final cached = TextEditingController(text: '0');
    final cost = TextEditingController(text: '0');
    final result = await showDialog<Map<String, dynamic>>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Ingest verified AI usage'),
        content: SizedBox(
          width: 560,
          child: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                TextField(controller: requestId, decoration: const InputDecoration(labelText: 'Provider request ID', border: OutlineInputBorder())),
                const SizedBox(height: 10),
                TextField(controller: provider, decoration: const InputDecoration(labelText: 'Provider', border: OutlineInputBorder())),
                const SizedBox(height: 10),
                TextField(controller: model, decoration: const InputDecoration(labelText: 'Model', border: OutlineInputBorder())),
                const SizedBox(height: 10),
                TextField(controller: app, decoration: const InputDecoration(labelText: 'App ID', border: OutlineInputBorder())),
                const SizedBox(height: 10),
                TextField(controller: input, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'Input tokens', border: OutlineInputBorder())),
                const SizedBox(height: 10),
                TextField(controller: output, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'Output tokens', border: OutlineInputBorder())),
                const SizedBox(height: 10),
                TextField(controller: cached, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'Cached tokens', border: OutlineInputBorder())),
                const SizedBox(height: 10),
                TextField(controller: cost, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'Cost (KES)', border: OutlineInputBorder())),
              ],
            ),
          ),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context), child: const Text('Cancel')),
          FilledButton(
            onPressed: () => Navigator.pop(context, {
              'usage': {
                'requestId': requestId.text.trim(),
                'provider': provider.text.trim(),
                'model': model.text.trim(),
                'appId': app.text.trim(),
                'operation': 'inference',
                'inputTokens': int.tryParse(input.text.trim()) ?? 0,
                'outputTokens': int.tryParse(output.text.trim()) ?? 0,
                'cachedTokens': int.tryParse(cached.text.trim()) ?? 0,
                'costMinor': ((double.tryParse(cost.text.trim()) ?? 0) * 100).round(),
              },
            }),
            child: const Text('Record usage'),
          ),
        ],
      ),
    );
    for (final controller in [requestId, provider, model, app, input, output, cached, cost]) {
      controller.dispose();
    }
    if (result != null) await _call('recordAiUsage', result);
  }

  Future<void> _resolveConflict(
    Map<String, dynamic> conflict,
    String appId,
    String mutationId,
    bool applyClient,
  ) async {
    Map<String, dynamic>? record;
    if (applyClient) {
      final controller = TextEditingController(text: '{\n  "title": "Resolved offline record",\n  "status": "ACTIVE"\n}');
      final raw = await showDialog<String>(
        context: context,
        builder: (context) => AlertDialog(
          title: const Text('Apply client record'),
          content: SizedBox(
            width: 560,
            child: TextField(
              controller: controller,
              minLines: 8,
              maxLines: 14,
              decoration: const InputDecoration(
                labelText: 'Client record JSON',
                helperText: 'This explicitly overwrites fields on the current server record and increments its version.',
                border: OutlineInputBorder(),
              ),
            ),
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(context), child: const Text('Cancel')),
            FilledButton(onPressed: () => Navigator.pop(context, controller.text), child: const Text('Apply')),
          ],
        ),
      );
      controller.dispose();
      if (raw == null) return;
      try {
        final decoded = jsonDecode(raw);
        if (decoded is! Map) throw const FormatException('Expected JSON object');
        record = Map<String, dynamic>.from(decoded);
      } catch (error) {
        if (!mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Invalid JSON: $error')));
        return;
      }
    }
    await _call('resolveSyncConflict', {
      'appId': appId,
      'mutationId': mutationId,
      'recordId': conflict['recordId'],
      'strategy': applyClient ? 'apply_client_record' : 'server_wins',
      if (record != null) 'record': record,
    });
  }

  (String, String) _parseReceiptId(String value) {
    if (value.isEmpty) return ('', '');
    final knownApps = <String>[
      'mc25_geo_and_mining_intelligence',
      'mc25_mining_operations',
      'fieldservice',
      'procurement',
      'ecommerce',
      'inventory',
      'projects',
      'helpdesk',
      'property',
      'marketing',
      'bookings',
      'manufacturing',
      'freight',
      'fleet',
      'crm',
      'hr',
    ]..sort((a, b) => b.length.compareTo(a.length));
    for (final app in knownApps) {
      final prefix = '${app}_';
      if (value.startsWith(prefix)) return (app, value.substring(prefix.length));
    }
    final split = value.indexOf('_');
    if (split <= 0 || split >= value.length - 1) return ('', '');
    return (value.substring(0, split), value.substring(split + 1));
  }

  Widget _metric(String label, Object value, IconData icon) => Container(
        width: 210,
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          border: Border.all(color: const Color(0xFFE2E8F0)),
          borderRadius: BorderRadius.circular(14),
        ),
        child: Row(
          children: [
            Icon(icon, color: widget.module.color),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(label, style: const TextStyle(fontSize: 11, color: Color(0xFF64748B))),
                  Text(value.toString(), overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.bold)),
                ],
              ),
            ),
          ],
        ),
      );

  Widget _sectionTitle(String value) => Text(
        value,
        style: Theme.of(context).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.bold),
      );

  Widget _stateChip(String state) => Chip(label: Text(state.replaceAll('_', ' ')));

  IconData _stateIcon(String state) {
    if (state == 'implemented') return Icons.verified_rounded;
    if (state.startsWith('blocked')) return Icons.lock_clock_rounded;
    return Icons.construction_rounded;
  }

  String _humanize(String value) => value
      .replaceAllMapped(RegExp(r'([a-z])([A-Z])'), (match) => '${match.group(1)} ${match.group(2)}')
      .replaceAll('_', ' ')
      .split(' ')
      .where((part) => part.isNotEmpty)
      .map((part) => '${part[0].toUpperCase()}${part.substring(1)}')
      .join(' ');

  String _money(Object? minor) {
    final value = minor is num ? minor.toDouble() : double.tryParse(minor?.toString() ?? '') ?? 0;
    return 'KES ${(value / 100).toStringAsFixed(2)}';
  }
}
