import 'dart:convert';
import 'dart:math';

import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../suite.dart';

const _pretty = JsonEncoder.withIndent('  ');
String _requestId() => List.generate(
  4,
  (_) => Random.secure().nextInt(1 << 32).toRadixString(16),
).join('-');
List<Map<String, dynamic>> _rows(dynamic value) => (value as List? ?? [])
    .map((row) => Map<String, dynamic>.from(row as Map))
    .toList();

class AutomationStudio extends StatefulWidget {
  final SuiteStore store;
  final VoidCallback? onUpgrade;
  const AutomationStudio({super.key, required this.store, this.onUpgrade});

  @override
  State<AutomationStudio> createState() => _AutomationStudioState();
}

class _AutomationStudioState extends State<AutomationStudio> {
  Map<String, dynamic>? _data;
  String? _error;
  bool _busy = false;
  bool get _premium => _data?['premium'] == true;
  List<Map<String, dynamic>> get _connections => _rows(_data?['connections']);
  List<Map<String, dynamic>> get _workflows => _rows(_data?['workflows']);
  List<Map<String, dynamic>> get _exchangeRules => _rows(_data?['exchange']?['rules']);
  List<Map<String, dynamic>> get _exchangeRuns => _rows(_data?['exchange']?['runs']);

  @override
  void initState() {
    super.initState();
    if (!widget.store.demo) _load();
  }

  Future<void> _load() async {
    try {
      final values = await Future.wait([
        widget.store.call('getAutomationStudio'),
        widget.store.call('getDataExchange'),
      ]);
      final data = <String, dynamic>{...values[0], 'exchange': values[1]};
      if (mounted) {
        setState(() {
          _data = data;
          _error = null;
        });
      }
    } catch (error) {
      if (mounted) setState(() => _error = error.toString());
    }
  }

  Future<Map<String, dynamic>?> _action(
    String name,
    Map<String, dynamic> input,
  ) async {
    if (_busy) return null;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final result = await widget.store.call(name, input);
      await _load();
      return result;
    } catch (error) {
      if (mounted) setState(() => _error = error.toString());
      return null;
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _showResult(String title, dynamic result) async {
    if (!mounted) return;
    await showDialog<void>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(title),
        content: SizedBox(
          width: 650,
          child: SingleChildScrollView(
            child: SelectableText(_pretty.convert(result)),
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Close'),
          ),
        ],
      ),
    );
  }

  Future<void> _connect(String provider) async {
    final result = await _action('startAutomationOAuth', {
      'provider': provider,
    });
    if (result == null || !mounted) return;
    final name = switch (provider) {
      'google' => 'Google Workspace',
      'notion' => 'Notion',
      'microsoft' => 'Microsoft 365',
      'powerbi' => 'Power BI',
      _ => provider,
    };
    await showDialog<void>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: Text('Connect $name'),
        content: const Text(
          'Sign in in the new tab, then return here and refresh your connections.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () async {
              // Open directly from this gesture, after the OAuth URL is ready.
              try {
                final opened = await launchUrl(
                  Uri.parse(result['url'] as String),
                  webOnlyWindowName: '_blank',
                );
                if (!opened) {
                  throw StateError(
                    'Unable to open sign-in. Allow a new browser tab and try again.',
                  );
                }
              } catch (error) {
                if (mounted) setState(() => _error = error.toString());
              }
              if (dialogContext.mounted) Navigator.pop(dialogContext);
            },
            child: Text('Continue to $name'),
          ),
        ],
      ),
    );
  }

  Future<void> _remoteConnection() async {
    final values = await _textDialog(
      context,
      'Connect an MCP server',
      const {
        'name': 'Connection name',
        'url': 'HTTPS MCP endpoint',
        'token': 'Bearer token (optional)',
      },
      secretKeys: const {'token'},
    );
    if (values != null) {
      await _action('connectRemoteMcp', {'connection': values});
    }
  }

  Future<void> _businessConnection(String provider) async {
    final values = await _textDialog(
      context,
      'Connect $provider',
      const {'name': 'Connection name', 'token': 'Provider access token'},
      secretKeys: const {'token'},
    );
    if (values != null) {
      await _action('connectBusinessTool', {
        'connection': {...values, 'provider': provider},
      });
    }
  }


  Future<void> _enterpriseConnection(String provider) async {
    final fields = <String, String>{'name': 'Connection name'};
    final secretKeys = <String>{};
    switch (provider) {
      case 'salesforce':
        fields.addAll({
          'instance_url': 'Salesforce instance URL',
          'access_token': 'Access token',
        });
        secretKeys.add('access_token');
        break;
      case 'atlassian':
        fields.addAll({
          'site_url': 'Atlassian site URL',
          'email': 'Atlassian account email',
          'api_token': 'API token',
        });
        secretKeys.add('api_token');
        break;
      case 'zoho':
        fields.addAll({
          'api_domain': 'Zoho API domain',
          'access_token': 'OAuth access token',
        });
        secretKeys.add('access_token');
        break;
      case 'odoo':
        fields.addAll({
          'base_url': 'Odoo base URL',
          'database': 'Database (optional if host selects it)',
          'api_key': 'API key',
        });
        secretKeys.add('api_key');
        break;
    }
    final values = await _textDialog(
      context,
      'Connect ' + provider,
      fields,
      secretKeys: secretKeys,
    );
    if (values == null) return;
    final name = values.remove('name') ?? provider;
    await _action('connectEnterpriseTool', {
      'connection': {
        'provider': provider,
        'name': name,
        'credential': values,
      },
    });
  }

  Future<void> _newExchangeRule() async {
    final connected = _connections
        .where((connection) => connection['status'] == 'connected')
        .toList();
    if (connected.isEmpty) {
      setState(
        () => _error =
            'Connect a provider before creating a data exchange rule.',
      );
      return;
    }
    var connectionId = connected.first['id'].toString();
    var tools = _rows(connected.first['tools']);
    var toolName = tools.isEmpty ? '' : tools.first['name'].toString();
    var target = 'crm';
    var schedule = 'manual';

    final approved = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => StatefulBuilder(
        builder: (dialogContext, setDialogState) {
          final connection = connected.firstWhere(
            (item) => item['id'].toString() == connectionId,
          );
          tools = _rows(connection['tools']);
          if (tools.isNotEmpty &&
              !tools.any((item) => item['name'].toString() == toolName)) {
            toolName = tools.first['name'].toString();
          }
          return AlertDialog(
            title: const Text('New governed data exchange'),
            content: SizedBox(
              width: 620,
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  DropdownButtonFormField<String>(
                    initialValue: connectionId,
                    decoration:
                        const InputDecoration(labelText: 'Source connection'),
                    items: [
                      for (final item in connected)
                        DropdownMenuItem(
                          value: item['id'].toString(),
                          child: Text(
                            item['name'].toString() +
                                ' · ' +
                                item['provider'].toString(),
                          ),
                        ),
                    ],
                    onChanged: (value) => setDialogState(() {
                      if (value != null) connectionId = value;
                    }),
                  ),
                  const SizedBox(height: 12),
                  DropdownButtonFormField<String>(
                    initialValue: toolName.isEmpty ? null : toolName,
                    decoration:
                        const InputDecoration(labelText: 'Read/list tool'),
                    items: [
                      for (final item in tools)
                        DropdownMenuItem(
                          value: item['name'].toString(),
                          child: Text(item['name'].toString()),
                        ),
                    ],
                    onChanged: (value) => setDialogState(() {
                      if (value != null) toolName = value;
                    }),
                  ),
                  const SizedBox(height: 12),
                  DropdownButtonFormField<String>(
                    initialValue: target,
                    decoration:
                        const InputDecoration(labelText: 'TeknTandao target'),
                    items: const [
                      DropdownMenuItem(
                        value: 'crm',
                        child: Text('CRM contacts'),
                      ),
                      DropdownMenuItem(
                        value: 'inventory',
                        child: Text('Inventory'),
                      ),
                      DropdownMenuItem(
                        value: 'helpdesk',
                        child: Text('Support tickets'),
                      ),
                      DropdownMenuItem(
                        value: 'projects',
                        child: Text('Projects'),
                      ),
                    ],
                    onChanged: (value) => setDialogState(() {
                      if (value != null) target = value;
                    }),
                  ),
                  const SizedBox(height: 12),
                  DropdownButtonFormField<String>(
                    initialValue: schedule,
                    decoration: const InputDecoration(labelText: 'Schedule'),
                    items: const [
                      DropdownMenuItem(value: 'manual', child: Text('Manual only')),
                      DropdownMenuItem(value: 'hourly', child: Text('Every hour')),
                      DropdownMenuItem(value: 'daily', child: Text('Daily')),
                    ],
                    onChanged: (value) => setDialogState(() {
                      if (value != null) schedule = value;
                    }),
                  ),
                  const SizedBox(height: 10),
                  const Text(
                    'The source tool is sampled first. AI proposes field mappings; nothing syncs until you review and enable the rule.',
                    style: TextStyle(color: Color(0xFF64748B)),
                  ),
                ],
              ),
            ),
            actions: [
              TextButton(
                onPressed: () => Navigator.pop(dialogContext, false),
                child: const Text('Cancel'),
              ),
              FilledButton(
                onPressed: toolName.isEmpty
                    ? null
                    : () => Navigator.pop(dialogContext, true),
                child: const Text('Suggest mapping'),
              ),
            ],
          );
        },
      ),
    );
    if (approved != true) return;

    final suggestion = await _action('suggestDataExchangeMapping', {
      'connectionId': connectionId,
      'tool': toolName,
      'target': target,
      'args': <String, dynamic>{},
    });
    if (suggestion == null || !mounted) return;
    final nameValues = await _textDialog(
      context,
      'Review AI mapping',
      const {
        'name': 'Rule name',
        'sourceIdPath': 'Stable external ID path',
        'mappings': 'Mapping JSON array',
      },
      initial: {
        'name': target.toUpperCase() + ' sync',
        'sourceIdPath': suggestion['sourceIdPath'].toString(),
        'mappings': _pretty.convert(suggestion['mappings']),
      },
      multilineKeys: const {'mappings'},
    );
    if (nameValues == null) return;
    try {
      final mappings = jsonDecode(nameValues['mappings'] ?? '[]');
      await _action('saveDataExchangeRule', {
        'rule': {
          'name': nameValues['name'],
          'connectionId': connectionId,
          'sourceTool': toolName,
          'sourceArgs': <String, dynamic>{},
          'sourceIdPath': nameValues['sourceIdPath'],
          'target': target,
          'mappings': mappings,
          'enabled': false,
          'conflictPolicy': 'skip_conflicts',
          'schedule': schedule,
        },
      });
    } catch (error) {
      if (mounted) setState(() => _error = 'Invalid mapping JSON: ' + error.toString());
    }
  }

  Future<void> _toggleExchangeRule(Map<String, dynamic> rule) async {
    final enable = rule['enabled'] != true;
    if (enable &&
        !await _confirm(
          context,
          'Enable ' + rule['name'].toString() + '?',
          'External records can update TeknTandao ' +
              rule['target'].toString() +
              ' data. Conflicts default to review instead of overwriting manually edited records.',
        )) {
      return;
    }
    await _action('saveDataExchangeRule', {
      'id': rule['id'],
      'rule': {
        'name': rule['name'],
        'connectionId': rule['connectionId'],
        'sourceTool': rule['sourceTool'],
        'sourceArgs': Map<String, dynamic>.from(
          rule['sourceArgs'] as Map? ?? const {},
        ),
        'sourceIdPath': rule['sourceIdPath'],
        'target': rule['target'],
        'mappings': rule['mappings'],
        'enabled': enable,
        'conflictPolicy': rule['conflictPolicy'] ?? 'skip_conflicts',
        'schedule': rule['schedule'] ?? 'manual',
      },
    });
  }

  Future<void> _runExchangeRule(Map<String, dynamic> rule) async {
    final result =
        await _action('runDataExchangeRule', {'id': rule['id']});
    if (result != null) {
      await _showResult('Data exchange result', result);
    }
  }

  Future<void> _editWorkflow([Map<String, dynamic>? saved]) async {
    final workflow = await showDialog<Map<String, dynamic>>(
      context: context,
      builder: (_) => _WorkflowEditor(
        connections: _connections
            .where((item) => item['status'] == 'connected')
            .toList(),
        premium: _premium,
        initial: saved,
      ),
    );
    if (workflow != null) {
      await _action('saveToolWorkflow', {
        'workflow': workflow,
        if (saved != null) 'id': saved['id'],
      });
    }
  }

  Map<String, dynamic> _workflowDefinition(
    Map<String, dynamic> saved,
    bool enabled,
  ) => {
    'name': saved['name'],
    'description': saved['description'] ?? '',
    'trigger': saved['trigger'],
    'steps': saved['steps'],
    'enabled': enabled,
  };

  Future<void> _enableWorkflow(Map<String, dynamic> saved) async {
    final enable = saved['enabled'] != true;
    if (enable &&
        !await _confirm(
          context,
          'Enable ${saved['name']}?',
          'This authorizes its configured tool actions, including external writes. ${saved['trigger'] == 'manual' ? 'It will run when you or an authorized MCP client starts it.' : 'It will run automatically on ${saved['trigger']} events.'}\n\n${_pretty.convert(saved['steps'])}',
        )) {
      return;
    }
    await _action('saveToolWorkflow', {
      'id': saved['id'],
      'workflow': _workflowDefinition(saved, enable),
    });
  }

  Future<void> _runWorkflow(Map<String, dynamic> saved) async {
    await showDialog<void>(
      context: context,
      builder: (_) => _WorkflowRunner(store: widget.store, workflow: saved),
    );
    await _load();
  }

  Future<void> _generateFeature() async {
    final values = await _textDialog(
      context,
      'Describe your feature',
      const {
        'description':
            'What should this feature collect, calculate or automate?',
      },
      multilineKeys: const {'description'},
    );
    if (values == null) return;
    final result = await _action('generateCustomFeature', values);
    if (result != null && mounted) {
      await _featurePreview({
        'id': result['id'],
        'feature': result['feature'],
        'status': 'draft',
      });
    }
  }

  Future<void> _developerFeature([Map<String, dynamic>? saved]) async {
    final definition =
        saved?['feature'] ??
        {
          'name': 'Quote calculator',
          'description': 'Calculate a quote from quantity and unit price.',
          'fields': [
            {
              'key': 'quantity',
              'label': 'Quantity',
              'type': 'number',
              'required': true,
            },
            {
              'key': 'unitPrice',
              'label': 'Unit price',
              'type': 'number',
              'required': true,
            },
          ],
          'code': 'return { total: input.quantity * input.unitPrice };',
          'workflowId': null,
        };
    final values = await _textDialog(
      context,
      'Developer customization',
      const {
        'definition':
            'Feature JSON: fields, JavaScript function body and optional workflowId',
      },
      initial: {'definition': _pretty.convert(definition)},
      multilineKeys: const {'definition'},
    );
    if (values == null) return;
    try {
      final feature = jsonDecode(values['definition']!);
      await _action('saveCustomFeature', {
        'feature': feature,
        if (saved != null) 'id': saved['id'],
      });
    } catch (error) {
      if (mounted) setState(() => _error = 'Invalid JSON: $error');
    }
  }

  Future<void> _featurePreview(
    Map<String, dynamic> saved, {
    bool run = false,
  }) async {
    await showDialog<void>(
      context: context,
      builder: (_) => _FeatureForm(store: widget.store, saved: saved, run: run),
    );
    await _load();
  }

  Future<void> _publishFeature(Map<String, dynamic> feature) async {
    final enabled = feature['status'] != 'published';
    if (enabled &&
        !await _confirm(
          context,
          'Publish this feature?',
          'Make this form and its code available in this workspace. Submissions are saved, and an attached enabled workflow can perform external actions.',
        )) {
      return;
    }
    await _action('publishCustomFeature', {
      'id': feature['id'],
      'enabled': enabled,
    });
  }

  Future<void> _createKey() async {
    final selected = <String>{};
    final enabled = _workflows
        .where((item) => item['enabled'] == true)
        .toList();
    final approved = await showDialog<bool>(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, setDialogState) => AlertDialog(
          title: const Text('MCP workflow access'),
          content: SizedBox(
            width: 500,
            child: SingleChildScrollView(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Text(
                    'Choose the workflows this key can execute. The key expires in 30 days and can be revoked below.',
                  ),
                  if (enabled.isEmpty)
                    const Padding(
                      padding: EdgeInsets.all(16),
                      child: Text('Enable a workflow first.'),
                    ),
                  for (final workflow in enabled)
                    CheckboxListTile(
                      title: Text(workflow['name'].toString()),
                      value: selected.contains(workflow['id']),
                      onChanged: (value) => setDialogState(() {
                        value == true
                            ? selected.add(workflow['id'])
                            : selected.remove(workflow['id']);
                      }),
                    ),
                ],
              ),
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context, false),
              child: const Text('Cancel'),
            ),
            FilledButton(
              onPressed: selected.isEmpty
                  ? null
                  : () => Navigator.pop(context, true),
              child: const Text('Create key'),
            ),
          ],
        ),
      ),
    );
    if (approved != true) return;
    final result = await _action('createWorkspaceMcpKey', {
      'workflowIds': selected.toList(),
    });
    if (result != null) {
      await _showResult('Save this key — shown only once', {
        'url': result['url'],
        'headers': {'Authorization': 'Bearer ${result['token']}'},
        'expiresAt': DateTime.fromMillisecondsSinceEpoch(
          result['expiresAt'] as int,
        ).toIso8601String(),
      });
    }
  }

  @override
  Widget build(BuildContext context) => DefaultTabController(
    length: 6,
    child: Scaffold(
      appBar: AppBar(
        title: const Text('Automation Studio'),
        actions: [
          IconButton(
            tooltip: 'Refresh connections and runs',
            onPressed: _busy || widget.store.demo ? null : _load,
            icon: const Icon(Icons.refresh),
          ),
        ],
        bottom: const TabBar(
          isScrollable: true,
          tabs: [
            Tab(text: 'Connections'),
            Tab(text: 'Data Exchange'),
            Tab(text: 'Workflows'),
            Tab(text: 'Customization'),
            Tab(text: 'Run history'),
            Tab(text: 'Developer'),
          ],
        ),
      ),
      body: widget.store.demo
          ? const Center(
              child: Padding(
                padding: EdgeInsets.all(24),
                child: Text(
                  'Sign in to a workspace as its owner to connect services and build automations.',
                ),
              ),
            )
          : Column(
              children: [
                if (_busy) const LinearProgressIndicator(),
                if (_error != null)
                  MaterialBanner(
                    content: Text(_error!),
                    actions: [
                      TextButton(
                        onPressed: () => setState(() => _error = null),
                        child: const Text('Dismiss'),
                      ),
                    ],
                  ),
                if (_data == null && _error == null)
                  const Expanded(
                    child: Center(child: CircularProgressIndicator()),
                  )
                else if (_data != null)
                  Expanded(
                    child: TabBarView(
                      children: [
                        _connectionTab(),
                        _exchangeTab(),
                        _workflowTab(),
                        _featureTab(),
                        _historyTab(),
                        _mcpTab(),
                      ],
                    ),
                  ),
              ],
            ),
    ),
  );

  Widget _page(List<Widget> children) => Align(
    alignment: Alignment.topCenter,
    child: ConstrainedBox(
      constraints: const BoxConstraints(maxWidth: 1000),
      child: ListView(padding: const EdgeInsets.all(20), children: children),
    ),
  );
  Widget _card(
    String title,
    String subtitle,
    List<Widget> actions, {
    Widget? extra,
  }) => Card(
    child: Padding(
      padding: const EdgeInsets.all(18),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(title, style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: 8),
          Text(subtitle),
          ?extra,
          if (actions.isNotEmpty)
            Padding(
              padding: const EdgeInsets.only(top: 12),
              child: Wrap(spacing: 8, runSpacing: 8, children: actions),
            ),
        ],
      ),
    ),
  );

  Widget _connectionTab() => _page([
    const Text(
      'Connect business tools',
      style: TextStyle(fontSize: 24, fontWeight: FontWeight.bold),
    ),
    const SizedBox(height: 8),
    const Text(
      'Connections are managed by workspace owners. After signing in with a provider, return here and refresh.',
    ),
    _card(
      'Google Workspace',
      'Gmail, Drive, Calendar, Sheets, Docs and Slides: send mail, manage files, schedule events, automate spreadsheets, create reports and publish presentations. Reconnect existing Google accounts to authorize the expanded scopes.',
      [
        FilledButton.icon(
          onPressed: _busy ? null : () => _connect('google'),
          icon: const Icon(Icons.login),
          label: const Text('Connect Google'),
        ),
      ],
    ),
    _card(
      'Notion',
      'Search shared pages and create pages in your connected workspace.',
      [
        FilledButton.icon(
          onPressed: _busy ? null : () => _connect('notion'),
          icon: const Icon(Icons.login),
          label: const Text('Connect Notion'),
        ),
      ],
    ),
    _card(
      'Microsoft 365 / PowerPoint',
      'Connect Microsoft 365 to deliver generated PowerPoint, Excel, Word, PDF and CSV exports into OneDrive.',
      [
        FilledButton.icon(
          onPressed: _busy ? null : () => _connect('microsoft'),
          icon: const Icon(Icons.login),
          label: const Text('Connect Microsoft 365'),
        ),
      ],
    ),
    _card(
      'Power BI',
      'Publish bounded Executive Intelligence data into a Power BI push semantic model using a separate audience-scoped Microsoft connection.',
      [
        FilledButton.icon(
          onPressed: _busy ? null : () => _connect('powerbi'),
          icon: const Icon(Icons.analytics_outlined),
          label: const Text('Connect Power BI'),
        ),
      ],
    ),
    _card(
      'Remote MCP server',
      'Connect other tools through a public HTTPS Streamable HTTP server. Supports bearer tokens and unauthenticated servers.',
      [
        OutlinedButton.icon(
          onPressed: _busy ? null : _remoteConnection,
          icon: const Icon(Icons.add_link),
          label: const Text('Add MCP server'),
        ),
      ],
    ),
    _card(
      'Slack',
      'List channels, read history and post messages. Use a bot token with channels:read, channels:history and chat:write; invite the bot to each channel.',
      [
        OutlinedButton(
          onPressed: _busy ? null : () => _businessConnection('slack'),
          child: const Text('Connect Slack'),
        ),
      ],
    ),
    _card(
      'HubSpot CRM',
      'Read contacts and deals, and create contacts. Use a private-app token with contacts read/write and deals read scopes.',
      [
        OutlinedButton(
          onPressed: _busy ? null : () => _businessConnection('hubspot'),
          child: const Text('Connect HubSpot'),
        ),
      ],
    ),

    _card(
      'Salesforce',
      'Accounts, contacts and opportunities with governed contact upserts. Use an OAuth access token plus your Salesforce instance URL.',
      [
        OutlinedButton(
          onPressed:
              _busy ? null : () => _enterpriseConnection('salesforce'),
          child: const Text('Connect Salesforce'),
        ),
      ],
    ),
    _card(
      'Atlassian / Jira',
      'Search issues and projects, create issues and add comments using an Atlassian API token.',
      [
        OutlinedButton(
          onPressed:
              _busy ? null : () => _enterpriseConnection('atlassian'),
          child: const Text('Connect Jira'),
        ),
      ],
    ),
    _card(
      'Zoho CRM',
      'Read contacts and deals, and upsert contacts through Zoho CRM APIs.',
      [
        OutlinedButton(
          onPressed: _busy ? null : () => _enterpriseConnection('zoho'),
          child: const Text('Connect Zoho'),
        ),
      ],
    ),
    _card(
      'Odoo',
      'Read contacts, products and sale orders, and create contacts through Odoo JSON-RPC using a scoped API key.',
      [
        OutlinedButton(
          onPressed: _busy ? null : () => _enterpriseConnection('odoo'),
          child: const Text('Connect Odoo'),
        ),
      ],
    ),
    _card(
      'Stripe MCP',
      'Use the remote MCP connection with https://mcp.stripe.com and a scoped Stripe agent API key. Review the tools before enabling payment workflows.',
      [
        TextButton(
          onPressed: _busy ? null : _remoteConnection,
          child: const Text('Add Stripe MCP'),
        ),
      ],
    ),
    const SizedBox(height: 20),
    const Text('Your connections', style: TextStyle(fontSize: 20)),
    if (_connections.isEmpty)
      const Padding(
        padding: EdgeInsets.all(16),
        child: Text('No services connected yet.'),
      ),
    for (final connection in _connections)
      _card(
        connection['name'].toString(),
        connection['status'].toString() +
            ' · ' +
            (connection['health'] ?? 'unchecked').toString() +
            ' · ' +
            _rows(connection['tools']).length.toString() +
            ' tools',
        [
          TextButton(
            onPressed: () =>
                _showResult('Available tools', connection['tools']),
            child: const Text('View tools'),
          ),
          if (connection['status'] == 'connected')
            TextButton.icon(
              onPressed: _busy
                  ? null
                  : () async {
                      final result = await _action('checkToolConnection', {
                        'id': connection['id'],
                      });
                      if (result != null) {
                        await _showResult('Connection health', result);
                      }
                    },
              icon: const Icon(Icons.monitor_heart_outlined),
              label: const Text('Check health'),
            ),
          if (connection['status'] == 'connected')
            TextButton(
              onPressed: _busy
                  ? null
                  : () async {
                      if (await _confirm(
                        context,
                        'Disconnect this service?',
                        'Workflows using this connection will stop. You can also revoke provider consent in your Google or Notion account.',
                      )) {
                        await _action('disconnectToolConnection', {
                          'id': connection['id'],
                        });
                      }
                    },
              child: const Text('Disconnect'),
            ),
        ],
      ),
  ]);


  Widget _exchangeTab() => _page([
    const Text(
      'Intelligent Data Exchange',
      style: TextStyle(fontSize: 24, fontWeight: FontWeight.bold),
    ),
    const SizedBox(height: 8),
    const Text(
      'Map external CRM, ERP and helpdesk data into canonical TeknTandao records. AI can suggest mappings from a live sample, but rules stay disabled until you explicitly review them.',
    ),
    const SizedBox(height: 16),
    Align(
      alignment: Alignment.centerLeft,
      child: FilledButton.icon(
        onPressed: _busy ? null : _newExchangeRule,
        icon: const Icon(Icons.sync_alt_rounded),
        label: const Text('New exchange rule'),
      ),
    ),
    if (_exchangeRules.isEmpty)
      const Padding(
        padding: EdgeInsets.all(20),
        child: Text('No data exchange rules yet.'),
      ),
    for (final rule in _exchangeRules)
      _card(
        rule['name'].toString(),
        (rule['enabled'] == true ? 'Enabled' : 'Draft') +
            ' · ' +
            rule['target'].toString() +
            ' · ' +
            rule['sourceTool'].toString() +
            ' · ' +
            (rule['schedule'] ?? 'manual').toString() +
            '\nConflict policy: ' +
            (rule['conflictPolicy'] ?? 'skip_conflicts').toString(),
        [
          TextButton(
            onPressed: () => _showResult('Exchange rule', rule),
            child: const Text('View mapping'),
          ),
          OutlinedButton(
            onPressed:
                _busy ? null : () => _toggleExchangeRule(rule),
            child: Text(
              rule['enabled'] == true
                  ? 'Disable'
                  : 'Review & enable',
            ),
          ),
          FilledButton(
            onPressed: _busy || rule['enabled'] != true
                ? null
                : () => _runExchangeRule(rule),
            child: const Text('Sync now'),
          ),
        ],
      ),
    const SizedBox(height: 24),
    const Text(
      'Recent sync receipts',
      style: TextStyle(fontSize: 20, fontWeight: FontWeight.w700),
    ),
    if (_exchangeRuns.isEmpty)
      const Padding(
        padding: EdgeInsets.all(16),
        child: Text('No sync runs yet.'),
      ),
    for (final run in _exchangeRuns.take(20))
      ListTile(
        leading: Icon(
          (run['conflicts'] ?? 0) == 0
              ? Icons.check_circle_outline_rounded
              : Icons.warning_amber_rounded,
        ),
        title: Text((run['ruleName'] ?? run['ruleId']).toString()),
        subtitle: Text(
          run['provider'].toString() +
              ' · read ' +
              (run['rowsRead'] ?? 0).toString() +
              ' · created ' +
              (run['created'] ?? 0).toString() +
              ' · updated ' +
              (run['updated'] ?? 0).toString() +
              ' · skipped ' +
              (run['skipped'] ?? 0).toString() +
              ' · conflicts ' +
              (run['conflicts'] ?? 0).toString(),
        ),
        trailing: TextButton(
          onPressed: () => _showResult('Sync receipt', run),
          child: const Text('Details'),
        ),
      ),
  ]);

  Widget _workflowTab() => _page([
    const Text(
      'Business workflows',
      style: TextStyle(fontSize: 24, fontWeight: FontWeight.bold),
    ),
    const SizedBox(height: 8),
    const Text(
      'Chain connected tools and optional code. Start manually or respond to a workspace business event. Review the steps before enabling.',
    ),
    const SizedBox(height: 16),
    Align(
      alignment: Alignment.centerLeft,
      child: FilledButton.icon(
        onPressed: _busy ? null : () => _editWorkflow(),
        icon: const Icon(Icons.add),
        label: const Text('New workflow'),
      ),
    ),
    if (_workflows.isEmpty)
      const Padding(
        padding: EdgeInsets.all(20),
        child: Text(
          'No workflows yet. Connect a service, then add its tools as steps.',
        ),
      ),
    for (final workflow in _workflows)
      _card(
        workflow['name'].toString(),
        '${workflow['enabled'] == true ? 'Enabled' : 'Draft'} · ${workflow['trigger']} · ${_rows(workflow['steps']).length} steps\n${workflow['description'] ?? ''}',
        [
          TextButton(
            onPressed: _busy ? null : () => _editWorkflow(workflow),
            child: const Text('Edit'),
          ),
          OutlinedButton(
            onPressed: _busy ? null : () => _enableWorkflow(workflow),
            child: Text(
              workflow['enabled'] == true ? 'Disable' : 'Review & enable',
            ),
          ),
          FilledButton(
            onPressed: _busy || workflow['enabled'] != true
                ? null
                : () => _runWorkflow(workflow),
            child: const Text('Run'),
          ),
        ],
      ),
  ]);

  Widget _featureTab() => _page([
    const Text(
      'Build your own features',
      style: TextStyle(fontSize: 24, fontWeight: FontWeight.bold),
    ),
    const SizedBox(height: 8),
    const Text(
      'Describe a form, calculator or business action and AI creates a draft. Preview it, then publish it to this workspace. Developers can edit the form definition and JavaScript, or attach an enabled workflow.',
    ),
    if (!_premium)
      _card(
        'Premium customization',
        'Included with an active paid workspace subscription.',
        [
          if (widget.onUpgrade != null)
            FilledButton(
              onPressed: widget.onUpgrade,
              child: const Text('View billing'),
            ),
        ],
      ),
    const SizedBox(height: 16),
    Wrap(
      spacing: 12,
      runSpacing: 8,
      children: [
        FilledButton.icon(
          onPressed: _busy || !_premium ? null : _generateFeature,
          icon: const Icon(Icons.auto_awesome),
          label: const Text('Describe a feature'),
        ),
        OutlinedButton.icon(
          onPressed: _busy || !_premium ? null : () => _developerFeature(),
          icon: const Icon(Icons.code),
          label: const Text('Add custom code'),
        ),
      ],
    ),
    const SizedBox(height: 12),
    for (final feature in _rows(_data?['features']))
      _card(
        feature['feature']['name'].toString(),
        '${feature['status']} · ${feature['feature']['description']}',
        [
          TextButton(
            onPressed: _busy || !_premium
                ? null
                : () => _featurePreview(feature),
            child: const Text('Preview'),
          ),
          TextButton(
            onPressed: _busy || !_premium
                ? null
                : () => _developerFeature(feature),
            child: const Text('Edit definition'),
          ),
          OutlinedButton(
            onPressed: _busy || !_premium
                ? null
                : () => _publishFeature(feature),
            child: Text(
              feature['status'] == 'published' ? 'Unpublish' : 'Publish',
            ),
          ),
          if (feature['status'] == 'published')
            FilledButton(
              onPressed: _busy || !_premium
                  ? null
                  : () => _featurePreview(feature, run: true),
              child: const Text('Open feature'),
            ),
        ],
      ),
  ]);

  Widget _historyTab() => _page([
    const Text(
      'Recent workflow runs',
      style: TextStyle(fontSize: 24, fontWeight: FontWeight.bold),
    ),
    const SizedBox(height: 8),
    const Text(
      'A run marked needs_review may have completed an external action before failing. Check the provider before starting a new run.',
    ),
    if (_rows(_data?['runs']).isEmpty)
      const Padding(padding: EdgeInsets.all(20), child: Text('No runs yet.')),
    for (final run in _rows(_data?['runs']))
      _card(
        run['name'].toString(),
        '${run['status']} · ${run['completedSteps']} steps completed\nRun ID: ${run['id']}',
        [
          TextButton(
            onPressed: () => _showResult('Run details', run),
            child: const Text('View result'),
          ),
        ],
      ),
    const SizedBox(height: 24),
    const Text('Recent feature submissions', style: TextStyle(fontSize: 20)),
    for (final record in _rows(_data?['records']))
      _card('Feature ${record['featureId']}', 'Submission: ${record['id']}', [
        TextButton(
          onPressed: () => _showResult('Saved submission', record),
          child: const Text('View submission'),
        ),
      ]),
  ]);

  Widget _mcpTab() => _page([
    const Text(
      'Developer: MCP & REST API',
      style: TextStyle(fontSize: 24, fontWeight: FontWeight.bold),
    ),
    const SizedBox(height: 8),
    const Text(
      'The workspace MCP server exposes enabled workflows to your AI tools. Create a scoped key and use it as a bearer token in your client’s Streamable HTTP configuration.',
    ),
    const SizedBox(height: 16),
    SelectableText(_data?['mcpUrl']?.toString() ?? ''),
    const SizedBox(height: 16),
    const Text('REST API — use the same scoped bearer key'),
    SelectableText(_data?['apiUrl']?.toString() ?? ''),
    const SelectableText(
      'GET /v1/workflows\nPOST /v1/workflows/{workflowId}/runs\nAuthorization: Bearer YOUR_KEY\nContent-Type: application/json\n\n{"runId":"unique-request-id","input":{}}\n\nReuse runId with identical input when retrying. A needs_review result requires checking the external service before starting a new run.',
    ),
    const SizedBox(height: 16),
    Align(
      alignment: Alignment.centerLeft,
      child: FilledButton(
        onPressed: _busy ? null : _createKey,
        child: const Text('Create workflow access key'),
      ),
    ),
    for (final key in _rows(_data?['keys']))
      _card(
        key['name'].toString(),
        '${(key['workflowIds'] as List).length} workflows · Expires ${DateTime.fromMillisecondsSinceEpoch(key['expiresAt'] as int).toLocal()}',
        [
          TextButton(
            onPressed: _busy
                ? null
                : () async {
                    if (await _confirm(
                      context,
                      'Revoke this key?',
                      'Clients using this key will lose access.',
                    )) {
                      await _action('revokeWorkspaceMcpKey', {'id': key['id']});
                    }
                  },
            child: const Text('Revoke'),
          ),
        ],
      ),
  ]);
}

Future<bool> _confirm(
  BuildContext context,
  String title,
  String message,
) async =>
    await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(title),
        content: SizedBox(
          width: 650,
          child: SingleChildScrollView(child: SelectableText(message)),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Confirm'),
          ),
        ],
      ),
    ) ??
    false;

Future<Map<String, String>?> _textDialog(
  BuildContext context,
  String title,
  Map<String, String> labels, {
  Map<String, String> initial = const {},
  Set<String> secretKeys = const {},
  Set<String> multilineKeys = const {},
}) async {
  final controllers = {
    for (final key in labels.keys)
      key: TextEditingController(text: initial[key] ?? ''),
  };
  final result = await showDialog<Map<String, String>>(
    context: context,
    builder: (context) => AlertDialog(
      title: Text(title),
      content: SizedBox(
        width: 700,
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              for (final entry in labels.entries)
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: 8),
                  child: TextField(
                    controller: controllers[entry.key],
                    obscureText: secretKeys.contains(entry.key),
                    minLines: multilineKeys.contains(entry.key) ? 5 : 1,
                    maxLines: multilineKeys.contains(entry.key) ? 20 : 1,
                    decoration: InputDecoration(
                      labelText: entry.value,
                      alignLabelWithHint: true,
                    ),
                  ),
                ),
            ],
          ),
        ),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(context),
          child: const Text('Cancel'),
        ),
        FilledButton(
          onPressed: () => Navigator.pop(context, {
            for (final entry in controllers.entries)
              entry.key: entry.value.text,
          }),
          child: const Text('Continue'),
        ),
      ],
    ),
  );
  // The route may still be animating after its result completes.
  await Future<void>.delayed(const Duration(milliseconds: 300));
  for (final controller in controllers.values) {
    controller.dispose();
  }
  return result;
}

class _WorkflowEditor extends StatefulWidget {
  final List<Map<String, dynamic>> connections;
  final bool premium;
  final Map<String, dynamic>? initial;
  const _WorkflowEditor({
    required this.connections,
    required this.premium,
    this.initial,
  });
  @override
  State<_WorkflowEditor> createState() => _WorkflowEditorState();
}

class _WorkflowEditorState extends State<_WorkflowEditor> {
  late final _name = TextEditingController(text: widget.initial?['name'] ?? '');
  late final _description = TextEditingController(
    text: widget.initial?['description'] ?? '',
  );
  late final _trigger = TextEditingController(
    text: widget.initial?['trigger'] ?? 'manual',
  );
  late final List<Map<String, dynamic>> _steps = _rows(
    widget.initial?['steps'],
  );
  String? _error;
  @override
  void dispose() {
    _name.dispose();
    _description.dispose();
    _trigger.dispose();
    super.dispose();
  }

  Future<void> _addTool() async {
    String? connectionId;
    String? toolName;
    String? error;
    final args = TextEditingController(text: '{}');
    final step = await showDialog<Map<String, dynamic>>(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, update) {
          final connection = widget.connections
              .where((item) => item['id'] == connectionId)
              .firstOrNull;
          final tools = _rows(connection?['tools']);
          final selectedTool = tools
              .where((item) => item['name'] == toolName)
              .firstOrNull;
          return AlertDialog(
            title: const Text('Add connected tool'),
            content: SizedBox(
              width: 650,
              child: SingleChildScrollView(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    DropdownButtonFormField<String>(
                      initialValue: connectionId,
                      isExpanded: true,
                      decoration: const InputDecoration(
                        labelText: 'Connection',
                      ),
                      items: [
                        for (final item in widget.connections)
                          DropdownMenuItem(
                            value: item['id'].toString(),
                            child: Text(item['name'].toString()),
                          ),
                      ],
                      onChanged: (value) => update(() {
                        connectionId = value;
                        toolName = null;
                      }),
                    ),
                    const SizedBox(height: 12),
                    DropdownButtonFormField<String>(
                      key: ValueKey(connectionId),
                      initialValue: toolName,
                      isExpanded: true,
                      decoration: const InputDecoration(labelText: 'Tool'),
                      items: [
                        for (final item in tools)
                          DropdownMenuItem(
                            value: item['name'].toString(),
                            child: Text(
                              item['name'].toString(),
                              overflow: TextOverflow.ellipsis,
                            ),
                          ),
                      ],
                      onChanged: (value) => update(() => toolName = value),
                    ),
                    if (selectedTool != null)
                      Padding(
                        padding: const EdgeInsets.symmetric(vertical: 12),
                        child: SelectableText(
                          '${selectedTool['description'] ?? ''}\n${_pretty.convert(selectedTool['inputSchema'])}',
                        ),
                      ),
                    const SizedBox(height: 12),
                    const Text(
                      'Use whole-value references such as "{{input.email}}" or "{{steps.0.id}}" in argument JSON.',
                    ),
                    const SizedBox(height: 12),
                    TextField(
                      controller: args,
                      minLines: 5,
                      maxLines: 12,
                      decoration: const InputDecoration(
                        labelText: 'Arguments JSON',
                        alignLabelWithHint: true,
                      ),
                    ),
                    if (error != null)
                      Text(error!, style: const TextStyle(color: Colors.red)),
                  ],
                ),
              ),
            ),
            actions: [
              TextButton(
                onPressed: () => Navigator.pop(context),
                child: const Text('Cancel'),
              ),
              FilledButton(
                onPressed: toolName == null
                    ? null
                    : () {
                        try {
                          final decoded = jsonDecode(args.text);
                          if (decoded is! Map<String, dynamic>) {
                            throw const FormatException('Use a JSON object');
                          }
                          Navigator.pop(context, {
                            'kind': 'tool',
                            'connectionId': connectionId,
                            'tool': toolName,
                            'arguments': decoded,
                          });
                        } catch (exception) {
                          update(() => error = exception.toString());
                        }
                      },
                child: const Text('Add step'),
              ),
            ],
          );
        },
      ),
    );
    if (step != null && mounted) setState(() => _steps.add(step));
    await Future<void>.delayed(const Duration(milliseconds: 300));
    args.dispose();
  }

  Future<void> _addCode() async {
    final values = await _textDialog(
      context,
      'JavaScript transformation',
      const {'code': 'Function body — input and steps are available'},
      initial: const {'code': 'return input;'},
      multilineKeys: const {'code'},
    );
    if (values != null && mounted) {
      setState(() => _steps.add({'kind': 'code', 'code': values['code']}));
    }
  }

  @override
  Widget build(BuildContext context) => AlertDialog(
    title: Text(widget.initial == null ? 'New workflow' : 'Edit workflow'),
    content: SizedBox(
      width: 750,
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            TextField(
              controller: _name,
              decoration: const InputDecoration(labelText: 'Workflow name'),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _description,
              decoration: const InputDecoration(labelText: 'Description'),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _trigger,
              decoration: const InputDecoration(
                labelText: 'Trigger: manual or business event type',
                helperText:
                    'Use an event your workspace publishes, such as sale.created.',
              ),
            ),
            const SizedBox(height: 16),
            for (var index = 0; index < _steps.length; index++)
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(8),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Expanded(
                            child: Text(
                              '${index + 1}. ${_steps[index]['tool'] ?? 'JavaScript'}',
                            ),
                          ),
                          IconButton(
                            tooltip: 'Move step up',
                            onPressed: index == 0
                                ? null
                                : () => setState(() {
                                    final step = _steps.removeAt(index);
                                    _steps.insert(index - 1, step);
                                  }),
                            icon: const Icon(Icons.arrow_upward),
                          ),
                          IconButton(
                            tooltip: 'Remove step',
                            onPressed: () =>
                                setState(() => _steps.removeAt(index)),
                            icon: const Icon(Icons.close),
                          ),
                        ],
                      ),
                      SelectableText(_pretty.convert(_steps[index])),
                    ],
                  ),
                ),
              ),
            Wrap(
              spacing: 8,
              children: [
                OutlinedButton(
                  onPressed: widget.connections.isEmpty || _steps.length >= 10
                      ? null
                      : _addTool,
                  child: const Text('Add tool step'),
                ),
                OutlinedButton(
                  onPressed: !widget.premium || _steps.length >= 10
                      ? null
                      : _addCode,
                  child: const Text('Add code · Premium'),
                ),
              ],
            ),
            const SizedBox(height: 12),
            const Text(
              'Saving creates a disabled draft. Enable it after reviewing the actions.',
            ),
            if (_error != null)
              Text(_error!, style: const TextStyle(color: Colors.red)),
          ],
        ),
      ),
    ),
    actions: [
      TextButton(
        onPressed: () => Navigator.pop(context),
        child: const Text('Cancel'),
      ),
      FilledButton(
        onPressed: () {
          if (_name.text.trim().isEmpty || _steps.isEmpty) {
            setState(() => _error = 'Enter a name and add at least one step.');
            return;
          }
          Navigator.pop(context, {
            'name': _name.text.trim(),
            'description': _description.text,
            'trigger': _trigger.text.trim(),
            'steps': _steps,
            'enabled': false,
          });
        },
        child: const Text('Save draft'),
      ),
    ],
  );
}

class _WorkflowRunner extends StatefulWidget {
  final SuiteStore store;
  final Map<String, dynamic> workflow;
  const _WorkflowRunner({required this.store, required this.workflow});
  @override
  State<_WorkflowRunner> createState() => _WorkflowRunnerState();
}

class _WorkflowRunnerState extends State<_WorkflowRunner> {
  final _input = TextEditingController(text: '{}');
  final _runId = _requestId();
  bool _busy = false;
  bool _submitted = false;
  String? _result;
  @override
  void dispose() {
    _input.dispose();
    super.dispose();
  }

  Future<void> _run() async {
    setState(() => _busy = true);
    try {
      final input = jsonDecode(_input.text);
      if (input is! Map) {
        throw const FormatException('Input must be a JSON object');
      }
      setState(() => _submitted = true);
      final result = await widget.store.call('runToolWorkflow', {
        'id': widget.workflow['id'],
        'runId': _runId,
        'input': input,
      });
      if (mounted) setState(() => _result = _pretty.convert(result));
    } catch (error) {
      if (mounted) setState(() => _result = error.toString());
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => AlertDialog(
    title: Text('Run ${widget.workflow['name']}'),
    content: SizedBox(
      width: 650,
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'This executes the enabled steps and may write to connected services.',
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _input,
              enabled: !_busy && !_submitted,
              minLines: 5,
              maxLines: 15,
              decoration: const InputDecoration(labelText: 'Input JSON'),
            ),
            if (_busy) const LinearProgressIndicator(),
            if (_result != null)
              Padding(
                padding: const EdgeInsets.only(top: 16),
                child: SelectableText(_result!),
              ),
            const SizedBox(height: 12),
            SelectableText('Run ID: $_runId'),
          ],
        ),
      ),
    ),
    actions: [
      TextButton(
        onPressed: _busy ? null : () => Navigator.pop(context),
        child: const Text('Close'),
      ),
      FilledButton(
        onPressed: _busy ? null : _run,
        child: Text(
          _result == null ? 'Run workflow' : 'Check / retry same run',
        ),
      ),
    ],
  );
}

class _FeatureForm extends StatefulWidget {
  final SuiteStore store;
  final Map<String, dynamic> saved;
  final bool run;
  const _FeatureForm({
    required this.store,
    required this.saved,
    required this.run,
  });
  @override
  State<_FeatureForm> createState() => _FeatureFormState();
}

class _FeatureFormState extends State<_FeatureForm> {
  Map<String, dynamic> get _feature =>
      Map<String, dynamic>.from(widget.saved['feature'] as Map);
  late final _fields = _rows(_feature['fields']);
  late final _controllers = {
    for (final field in _fields.where((field) => field['type'] != 'boolean'))
      field['key'].toString(): TextEditingController(),
  };
  final _booleans = <String, bool>{};
  final _form = GlobalKey<FormState>();
  final _runId = _requestId();
  bool _busy = false;
  bool _submitted = false;
  String? _result;
  @override
  void dispose() {
    for (final controller in _controllers.values) {
      controller.dispose();
    }
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_form.currentState!.validate()) return;
    setState(() => _busy = true);
    try {
      final input = <String, dynamic>{};
      for (final field in _fields) {
        final key = field['key'].toString();
        if (field['type'] == 'boolean') {
          input[key] = _booleans[key] ?? false;
          continue;
        }
        final value = _controllers[key]!.text;
        if (value.isEmpty && field['required'] != true) continue;
        input[key] = field['type'] == 'number' ? num.parse(value) : value;
      }
      if (widget.run) setState(() => _submitted = true);
      final result = await widget.store.call(
        widget.run ? 'runCustomFeature' : 'previewCustomFeature',
        {
          if (widget.run) ...{
            'id': widget.saved['id'],
            'runId': _runId,
          } else
            'feature': _feature,
          'input': input,
        },
      );
      if (mounted) setState(() => _result = _pretty.convert(result));
    } catch (error) {
      if (mounted) setState(() => _result = error.toString());
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => AlertDialog(
    title: Text('${widget.run ? '' : 'Preview: '}${_feature['name']}'),
    content: SizedBox(
      width: 650,
      child: SingleChildScrollView(
        child: Form(
          key: _form,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(_feature['description'].toString()),
              const SizedBox(height: 12),
              Text(
                widget.run
                    ? 'Submission is saved. An attached workflow will run its configured actions.'
                    : 'Preview runs the calculation only. It does not save a submission or execute connected tools.',
              ),
              for (final field in _fields)
                Padding(
                  padding: const EdgeInsets.only(top: 14),
                  child: field['type'] == 'boolean'
                      ? CheckboxListTile(
                          title: Text(field['label'].toString()),
                          value: _booleans[field['key']] ?? false,
                          onChanged: _busy || _submitted
                              ? null
                              : (value) => setState(
                                  () =>
                                      _booleans[field['key']] = value ?? false,
                                ),
                        )
                      : TextFormField(
                          controller: _controllers[field['key']],
                          enabled: !_busy && !_submitted,
                          keyboardType: field['type'] == 'number'
                              ? const TextInputType.numberWithOptions(
                                  decimal: true,
                                  signed: true,
                                )
                              : field['type'] == 'email'
                              ? TextInputType.emailAddress
                              : TextInputType.text,
                          decoration: InputDecoration(
                            labelText:
                                '${field['label']}${field['required'] == true ? ' *' : ''}',
                            hintText: field['type'] == 'date'
                                ? 'YYYY-MM-DD'
                                : null,
                          ),
                          validator: (value) {
                            if ((value ?? '').isEmpty) {
                              return field['required'] == true
                                  ? 'Required'
                                  : null;
                            }
                            if (field['type'] == 'number' &&
                                (num.tryParse(value!) == null ||
                                    !num.parse(value).isFinite)) {
                              return 'Enter a number';
                            }
                            return null;
                          },
                        ),
                ),
              if (!widget.run)
                ExpansionTile(
                  title: const Text('Generated code and workflow'),
                  children: [
                    SelectableText(_feature['code'].toString()),
                    SelectableText(
                      'Workflow: ${_feature['workflowId'] ?? 'None'}',
                    ),
                  ],
                ),
              if (_busy) const LinearProgressIndicator(),
              if (_result != null)
                Padding(
                  padding: const EdgeInsets.only(top: 16),
                  child: SelectableText(_result!),
                ),
            ],
          ),
        ),
      ),
    ),
    actions: [
      TextButton(
        onPressed: _busy ? null : () => Navigator.pop(context),
        child: const Text('Close'),
      ),
      FilledButton(
        onPressed: _busy ? null : _submit,
        child: Text(
          widget.run
              ? (_submitted ? 'Check / retry submission' : 'Submit')
              : 'Test preview',
        ),
      ),
    ],
  );
}
