import 'package:flutter/material.dart';

import '../suite.dart';
import 'website_platform_studio.dart';

class WebsiteBusinessStudioScreen extends StatefulWidget {
  final SuiteStore store;

  const WebsiteBusinessStudioScreen({super.key, required this.store});

  @override
  State<WebsiteBusinessStudioScreen> createState() =>
      _WebsiteBusinessStudioScreenState();
}

class _WebsiteBusinessStudioScreenState extends State<WebsiteBusinessStudioScreen> {
  int _section = 0;

  @override
  Widget build(BuildContext context) => Scaffold(
        body: Column(
          children: [
            Material(
              color: const Color(0xFF020617),
              child: SafeArea(
                bottom: false,
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(16, 8, 16, 8),
                  child: Row(
                    children: [
                      const Icon(Icons.auto_awesome_rounded, color: Colors.white),
                      const SizedBox(width: 10),
                      const Expanded(
                        child: Text(
                          'Website Intelligence',
                          style: TextStyle(
                            color: Colors.white,
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                      ),
                      SegmentedButton<int>(
                        style: ButtonStyle(
                          foregroundColor: WidgetStateProperty.all(Colors.white),
                        ),
                        segments: const [
                          ButtonSegment(
                            value: 0,
                            icon: Icon(Icons.web_rounded),
                            label: Text('Website Studio'),
                          ),
                          ButtonSegment(
                            value: 1,
                            icon: Icon(Icons.psychology_alt_rounded),
                            label: Text('AI Business Operator'),
                          ),
                        ],
                        selected: {_section},
                        onSelectionChanged: (value) =>
                            setState(() => _section = value.first),
                      ),
                    ],
                  ),
                ),
              ),
            ),
            Expanded(
              child: IndexedStack(
                index: _section,
                children: [
                  WebsitePlatformStudioScreen(store: widget.store),
                  WebsiteBusinessAgentScreen(store: widget.store),
                ],
              ),
            ),
          ],
        ),
      );
}

class WebsiteBusinessAgentScreen extends StatefulWidget {
  final SuiteStore store;

  const WebsiteBusinessAgentScreen({super.key, required this.store});

  @override
  State<WebsiteBusinessAgentScreen> createState() =>
      _WebsiteBusinessAgentScreenState();
}

class _WebsiteBusinessAgentScreenState extends State<WebsiteBusinessAgentScreen> {
  final _prompt = TextEditingController();
  Map<String, dynamic> _overview = const {};
  Map<String, dynamic> _context = const {};
  Map<String, dynamic>? _plan;
  String? _projectId;
  bool _busy = false;

  SuiteStore get store => widget.store;

  @override
  void initState() {
    super.initState();
    if (!store.demo) _bootstrap();
  }

  @override
  void dispose() {
    _prompt.dispose();
    super.dispose();
  }

  Future<void> _run(Future<void> Function() action) async {
    if (_busy) return;
    setState(() => _busy = true);
    try {
      await action();
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(error.toString()), backgroundColor: Colors.red),
        );
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _bootstrap() async {
    await _run(() async {
      await store.call('ensureWebsiteBusinessAgent');
      await store.call('refreshWebsiteBusinessCatalog');
      await _refresh();
    });
  }

  Future<void> _refresh() async {
    final overview = await store.call('getWebsiteBusinessAiOverview');
    final projects = (overview['projects'] as List? ?? const [])
        .whereType<Map>()
        .map((item) => Map<String, dynamic>.from(item))
        .toList();
    var projectId = _projectId;
    if (projectId == null || !projects.any((item) => item['projectId'] == projectId)) {
      projectId = projects.isEmpty ? null : projects.first['projectId']?.toString();
    }
    Map<String, dynamic> businessContext = const {};
    if (projectId != null) {
      businessContext = await store.call(
        'getWebsiteBusinessContext',
        {'projectId': projectId},
      );
    }
    if (!mounted) return;
    setState(() {
      _overview = overview;
      _projectId = projectId;
      _context = businessContext;
    });
  }

  Future<void> _selectProject(String? projectId) async {
    if (projectId == null) return;
    setState(() {
      _projectId = projectId;
      _plan = null;
    });
    await _run(() async {
      final value = await store.call(
        'getWebsiteBusinessContext',
        {'projectId': projectId},
      );
      if (mounted) setState(() => _context = value);
    });
  }

  Future<void> _generate() async {
    final goal = _prompt.text.trim();
    if (_projectId == null || goal.isEmpty) return;
    await _run(() async {
      final result = await store.call('generateWebsiteBusinessPlan', {
        'projectId': _projectId,
        'goal': goal,
      });
      if (!mounted) return;
      setState(() => _plan = result);
      await _refresh();
    });
  }

  Future<void> _loadPlan(String planId) async {
    await _run(() async {
      final plan = await store.call('getWebsiteBusinessPlan', {'planId': planId});
      if (mounted) {
        setState(() {
          _plan = plan;
          _projectId = plan['projectId']?.toString();
        });
      }
    });
  }

  Future<void> _requestAction(
    String kind, {
    String? mutationId,
  }) async {
    final plan = _plan;
    if (plan == null) return;
    await _run(() async {
      final request = await store.call('requestWebsiteBusinessAction', {
        'planId': plan['planId'],
        'kind': kind,
        'mutationId': ?mutationId,
      });
      final state = request['state']?.toString();
      if (state == 'allowed') {
        await _executeRequest(request['requestId'].toString());
      } else if (state == 'pending_approval') {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text(
                'Approval created in Agent Control Center. You can also approve it below.',
              ),
            ),
          );
        }
      } else {
        throw Exception(
          'Agent blocked this action: ${request['decision']?['reason'] ?? 'policy'}',
        );
      }
      await _refresh();
    });
  }

  Future<void> _approveAndExecute(String requestId) async {
    await _run(() async {
      await store.call('approveAgentAction', {
        'requestId': requestId,
        'approved': true,
      });
      await _executeRequest(requestId);
      await _refresh();
    });
  }

  Future<void> _executeRequest(String requestId) async {
    final execution = await store.call(
      'resolveWebsiteBusinessAction',
      {'requestId': requestId},
    );
    await store.call('executeAgentAction', {
      'permitId': execution['permitId'],
      'action': execution['action'],
      'payload': Map<String, dynamic>.from(execution['payload'] as Map),
    });
    final planId = execution['context']?['planId']?.toString();
    if (planId != null) {
      final updated = await store.call('getWebsiteBusinessPlan', {'planId': planId});
      if (mounted) setState(() => _plan = updated);
    }
  }

  void _preset(String text) {
    _prompt.text = text;
    _prompt.selection = TextSelection.collapsed(offset: text.length);
  }

  @override
  Widget build(BuildContext context) {
    if (store.demo) {
      return const Center(
        child: Padding(
          padding: EdgeInsets.all(32),
          child: Text(
            'Website Business AI uses your live Business Graph, Inventory, analytics and Agent Control Center. Sign in to a production workspace to use it.',
            textAlign: TextAlign.center,
          ),
        ),
      );
    }

    final projects = (_overview['projects'] as List? ?? const [])
        .whereType<Map>()
        .map((item) => Map<String, dynamic>.from(item))
        .toList();
    final metrics = _context['metrics'] is Map
        ? Map<String, dynamic>.from(_context['metrics'] as Map)
        : const <String, dynamic>{};
    final graph = _context['graph'] is Map
        ? Map<String, dynamic>.from(_context['graph'] as Map)
        : const <String, dynamic>{};

    return Scaffold(
      backgroundColor: const Color(0xFFF8FAFC),
      appBar: AppBar(
        automaticallyImplyLeading: false,
        title: const Text('AI Website Business Operator'),
        actions: [
          if (_busy)
            const Padding(
              padding: EdgeInsets.all(16),
              child: SizedBox(
                width: 18,
                height: 18,
                child: CircularProgressIndicator(strokeWidth: 2),
              ),
            ),
          IconButton(
            tooltip: 'Refresh business context',
            onPressed: _busy ? null : () => _run(_refresh),
            icon: const Icon(Icons.refresh_rounded),
          ),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(20, 20, 20, 80),
        children: [
          _hero(),
          const SizedBox(height: 16),
          if (projects.isEmpty)
            const Card(
              child: Padding(
                padding: EdgeInsets.all(24),
                child: Text('Create a website project in Website Studio first.'),
              ),
            )
          else ...[
            DropdownButtonFormField<String>(
              initialValue: _projectId,
              decoration: const InputDecoration(
                labelText: 'Website project',
                border: OutlineInputBorder(),
              ),
              items: projects
                  .map(
                    (project) => DropdownMenuItem(
                      value: project['projectId']?.toString(),
                      child: Text(
                        '${project['title'] ?? project['projectId']} · r${project['revision'] ?? 1}',
                      ),
                    ),
                  )
                  .toList(),
              onChanged: _busy ? null : _selectProject,
            ),
            const SizedBox(height: 16),
            _businessMetrics(metrics, graph),
            const SizedBox(height: 16),
            _promptCard(),
            const SizedBox(height: 16),
            if (_plan != null) _planCard(_plan!),
            const SizedBox(height: 16),
            _approvalCard(),
            const SizedBox(height: 16),
            _historyCard(),
          ],
        ],
      ),
    );
  }

  Widget _hero() => Container(
        padding: const EdgeInsets.all(24),
        decoration: BoxDecoration(
          gradient: const LinearGradient(
            colors: [Color(0xFF0F172A), Color(0xFF312E81)],
          ),
          borderRadius: BorderRadius.circular(18),
        ),
        child: const Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(Icons.hub_rounded, color: Colors.white),
                SizedBox(width: 10),
                Text(
                  'Business Graph × Website Studio × Agents',
                  style: TextStyle(
                    color: Colors.white,
                    fontSize: 20,
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ],
            ),
            SizedBox(height: 10),
            Text(
              'The AI sees privacy-safe graph aggregates, live inventory, sales performance and website analytics. It can redesign drafts automatically; publishing and product database writes are governed by Agent Control Center approvals.',
              style: TextStyle(color: Color(0xFFE2E8F0), height: 1.45),
            ),
          ],
        ),
      );

  Widget _businessMetrics(
    Map<String, dynamic> metrics,
    Map<String, dynamic> graph,
  ) => Wrap(
        spacing: 10,
        runSpacing: 10,
        children: [
          _metric('Graph nodes', '${graph['nodes'] ?? 0}', Icons.hub_rounded),
          _metric('Products', '${metrics['products'] ?? 0}', Icons.inventory_2_rounded),
          _metric('Low stock', '${metrics['lowStockProducts'] ?? 0}', Icons.warning_amber_rounded),
          _metric('Website views', '${metrics['websiteViews'] ?? 0}', Icons.visibility_rounded),
          _metric('Conversions', '${metrics['websiteConversions'] ?? 0}', Icons.ads_click_rounded),
          _metric(
            'Sales',
            _kesMinor(metrics['salesRevenueMinor']),
            Icons.payments_rounded,
          ),
        ],
      );

  Widget _promptCard() => Card(
        child: Padding(
          padding: const EdgeInsets.all(18),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text(
                'Tell the operator what to do',
                style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
              ),
              const SizedBox(height: 6),
              const Text(
                'Product instructions can add or edit Inventory records. Prices are interpreted as KES and stored as minor units.',
                style: TextStyle(color: Color(0xFF64748B)),
              ),
              const SizedBox(height: 12),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  ActionChip(
                    label: const Text('Build from my business'),
                    onPressed: () => _preset(
                      'Redesign this website around my actual products, strongest categories and sales performance. Bind product sections to live inventory and improve conversion while preserving the brand.',
                    ),
                  ),
                  ActionChip(
                    label: const Text('Optimize conversion'),
                    onPressed: () => _preset(
                      'Analyze website performance, product performance and Business Graph aggregates. Improve the current site for conversion and merchandising without inventing business facts.',
                    ),
                  ),
                  ActionChip(
                    label: const Text('Add product'),
                    onPressed: () => _preset(
                      'Add a new product to Inventory and make it visible on the website. Product: ',
                    ),
                  ),
                  ActionChip(
                    label: const Text('Edit product'),
                    onPressed: () => _preset(
                      'Find the matching existing product and propose only the database fields that need changing. Change: ',
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              TextField(
                controller: _prompt,
                minLines: 4,
                maxLines: 10,
                decoration: const InputDecoration(
                  hintText: 'Example: Add 1 kg premium Arabica coffee at KES 1,250, stock 40, feature it on the homepage, then create a stronger hero using our best-selling products.',
                  border: OutlineInputBorder(),
                ),
              ),
              const SizedBox(height: 12),
              FilledButton.icon(
                onPressed: _busy ? null : _generate,
                icon: const Icon(Icons.auto_awesome_rounded),
                label: const Text('Generate governed plan'),
              ),
            ],
          ),
        ),
      );

  Widget _planCard(Map<String, dynamic> plan) {
    final rationale = (plan['rationale'] as List? ?? const []).map((e) => e.toString()).toList();
    final changes = (plan['productChanges'] as List? ?? const [])
        .whereType<Map>()
        .map((item) => Map<String, dynamic>.from(item))
        .toList();
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(18),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                const Icon(Icons.psychology_alt_rounded),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    plan['summary']?.toString() ?? 'AI plan',
                    style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
                  ),
                ),
                Chip(label: Text(plan['state']?.toString() ?? 'proposed')),
              ],
            ),
            if (rationale.isNotEmpty) ...[
              const SizedBox(height: 10),
              ...rationale.take(5).map(
                    (item) => Padding(
                      padding: const EdgeInsets.only(bottom: 5),
                      child: Text('• $item'),
                    ),
                  ),
            ],
            const SizedBox(height: 14),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                FilledButton.tonalIcon(
                  onPressed: _busy ? null : () => _requestAction('apply_document'),
                  icon: const Icon(Icons.design_services_rounded),
                  label: const Text('Apply website draft'),
                ),
                FilledButton.icon(
                  onPressed: _busy ? null : () => _requestAction('publish'),
                  icon: const Icon(Icons.publish_rounded),
                  label: const Text('Request publish'),
                ),
              ],
            ),
            if (changes.isNotEmpty) ...[
              const Divider(height: 30),
              const Text(
                'AI product database changes',
                style: TextStyle(fontWeight: FontWeight.bold),
              ),
              const SizedBox(height: 8),
              for (final change in changes)
                Card(
                  color: const Color(0xFFF8FAFC),
                  child: ListTile(
                    leading: Icon(
                      change['operation'] == 'create'
                          ? Icons.add_box_rounded
                          : Icons.edit_note_rounded,
                    ),
                    title: Text(
                      '${change['operation']?.toString().toUpperCase()} · ${change['product']?['name'] ?? change['productId'] ?? change['mutationId']}',
                    ),
                    subtitle: Text(
                      change['reason']?.toString().isNotEmpty == true
                          ? change['reason'].toString()
                          : 'Governed Inventory change',
                    ),
                    trailing: FilledButton.tonal(
                      onPressed: _busy
                          ? null
                          : () => _requestAction(
                                'product',
                                mutationId: change['mutationId']?.toString(),
                              ),
                      child: const Text('Request'),
                    ),
                  ),
                ),
            ],
          ],
        ),
      ),
    );
  }

  Widget _approvalCard() {
    final currentPlanId = _plan?['planId']?.toString();
    final approvals = (_overview['approvals'] as List? ?? const [])
        .whereType<Map>()
        .map((item) => Map<String, dynamic>.from(item))
        .where((item) {
          final context = item['websiteAiContext'];
          return currentPlanId == null ||
              (context is Map && context['planId']?.toString() == currentPlanId);
        })
        .toList();
    if (approvals.isEmpty) return const SizedBox.shrink();
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(18),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'Agent Control Center approvals',
              style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 8),
            for (final approval in approvals)
              ListTile(
                contentPadding: EdgeInsets.zero,
                leading: const Icon(Icons.approval_rounded),
                title: Text(approval['action']?.toString() ?? 'Agent action'),
                subtitle: Text('State: ${approval['state'] ?? 'pending'}'),
                trailing: approval['state'] == 'pending'
                    ? FilledButton.tonal(
                        onPressed: _busy
                            ? null
                            : () => _approveAndExecute(
                                  approval['requestId'].toString(),
                                ),
                        child: const Text('Approve & execute'),
                      )
                    : approval['state'] == 'approved'
                        ? FilledButton.tonal(
                            onPressed: _busy
                                ? null
                                : () => _run(() async {
                                      await _executeRequest(
                                        approval['requestId'].toString(),
                                      );
                                      await _refresh();
                                    }),
                            child: const Text('Execute'),
                          )
                        : null,
              ),
          ],
        ),
      ),
    );
  }

  Widget _historyCard() {
    final plans = (_overview['plans'] as List? ?? const [])
        .whereType<Map>()
        .map((item) => Map<String, dynamic>.from(item))
        .toList();
    if (plans.isEmpty) return const SizedBox.shrink();
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(18),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'Recent AI plans',
              style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 8),
            ...plans.take(10).map(
                  (plan) => ListTile(
                    contentPadding: EdgeInsets.zero,
                    title: Text(plan['summary']?.toString() ?? 'AI plan'),
                    subtitle: Text(
                      '${plan['state'] ?? 'proposed'} · ${plan['productChanges'] is List ? (plan['productChanges'] as List).length : 0} product changes',
                    ),
                    trailing: const Icon(Icons.chevron_right_rounded),
                    onTap: () => _loadPlan(plan['planId'].toString()),
                  ),
                ),
          ],
        ),
      ),
    );
  }

  Widget _metric(String label, String value, IconData icon) => Container(
        width: 190,
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: const Color(0xFFE2E8F0)),
        ),
        child: Row(
          children: [
            Icon(icon, color: const Color(0xFF4F46E5)),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(label, style: const TextStyle(fontSize: 11, color: Color(0xFF64748B))),
                  Text(
                    value,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(fontWeight: FontWeight.bold),
                  ),
                ],
              ),
            ),
          ],
        ),
      );

  String _kesMinor(dynamic value) {
    final minor = (value as num?)?.toDouble() ?? 0;
    return 'KES ${(minor / 100).toStringAsFixed(0)}';
  }
}
