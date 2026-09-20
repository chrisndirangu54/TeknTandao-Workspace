import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:http/http.dart' as http;

import '../suite.dart';
import 'website_builder_module.dart';

class WebsitePlatformStudioScreen extends StatefulWidget {
  final SuiteStore store;

  const WebsitePlatformStudioScreen({super.key, required this.store});

  @override
  State<WebsitePlatformStudioScreen> createState() =>
      _WebsitePlatformStudioScreenState();
}

class _WebsitePlatformStudioScreenState
    extends State<WebsitePlatformStudioScreen> {
  int _section = 0;

  @override
  Widget build(BuildContext context) => Scaffold(
        body: Column(
          children: [
            Material(
              color: const Color(0xFF0F172A),
              child: SafeArea(
                bottom: false,
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(16, 8, 16, 8),
                  child: Row(
                    children: [
                      const Icon(Icons.language_rounded, color: Colors.white),
                      const SizedBox(width: 10),
                      const Text(
                        'Website Platform',
                        style: TextStyle(
                          color: Colors.white,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                      const Spacer(),
                      SegmentedButton<int>(
                        style: ButtonStyle(
                          foregroundColor:
                              WidgetStateProperty.all(Colors.white),
                        ),
                        segments: const [
                          ButtonSegment(
                            value: 0,
                            icon: Icon(Icons.design_services_rounded),
                            label: Text('Studio'),
                          ),
                          ButtonSegment(
                            value: 1,
                            icon: Icon(Icons.developer_board_rounded),
                            label: Text('Platform'),
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
                  WebsiteBuilderModuleScreen(store: widget.store),
                  WebsiteAdvancedPlatformPanel(store: widget.store),
                ],
              ),
            ),
          ],
        ),
      );
}

class WebsiteAdvancedPlatformPanel extends StatefulWidget {
  final SuiteStore store;

  const WebsiteAdvancedPlatformPanel({super.key, required this.store});

  @override
  State<WebsiteAdvancedPlatformPanel> createState() =>
      _WebsiteAdvancedPlatformPanelState();
}

class _WebsiteAdvancedPlatformPanelState
    extends State<WebsiteAdvancedPlatformPanel> {
  bool _busy = false;
  Map<String, dynamic> _growth = const {};
  Map<String, dynamic> _payout = const {};
  Map<String, dynamic> _plugins = const {'plugins': []};

  SuiteStore get store => widget.store;

  @override
  void initState() {
    super.initState();
    if (!store.demo) _refreshOwnerData();
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

  Future<void> _refreshOwnerData() async {
    try {
      final values = await Future.wait([
        store.call('getWebsiteGrowthAnalytics'),
        store.call('getWebsiteCreatorPayoutStatus'),
        store.call('getWebsitePluginMarketplace'),
      ]);
      if (!mounted) return;
      setState(() {
        _growth = values[0];
        _payout = values[1];
        _plugins = values[2];
      });
    } catch (_) {
      // Some platform views are owner-only. The live Firestore views below
      // continue to render whatever the signed-in collaborator may access.
    }
  }

  @override
  Widget build(BuildContext context) => DefaultTabController(
        length: 7,
        child: Scaffold(
          backgroundColor: const Color(0xFFF1F5F9),
          appBar: AppBar(
            automaticallyImplyLeading: false,
            title: const Text('Website Infrastructure & Growth'),
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
                onPressed: store.demo ? null : _refreshOwnerData,
                tooltip: 'Refresh platform data',
                icon: const Icon(Icons.refresh_rounded),
              ),
            ],
            bottom: const TabBar(
              isScrollable: true,
              tabs: [
                Tab(icon: Icon(Icons.public_rounded), text: 'Domains'),
                Tab(icon: Icon(Icons.perm_media_rounded), text: 'Assets'),
                Tab(icon: Icon(Icons.storage_rounded), text: 'CMS'),
                Tab(icon: Icon(Icons.extension_rounded), text: 'Plugins'),
                Tab(icon: Icon(Icons.group_work_rounded), text: 'Collaboration'),
                Tab(icon: Icon(Icons.science_rounded), text: 'Experiments'),
                Tab(icon: Icon(Icons.payments_rounded), text: 'Growth & Payouts'),
              ],
            ),
          ),
          body: TabBarView(
            children: [
              _domainsTab(),
              _assetsTab(),
              _cmsTab(),
              _pluginsTab(),
              _collaborationTab(),
              _experimentsTab(),
              _growthTab(),
            ],
          ),
        ),
      );

  Widget _streamList(
    String path, {
    required Widget Function(Map<String, dynamic>) itemBuilder,
    String empty = 'Nothing here yet.',
  }) =>
      StreamBuilder<List<Map<String, dynamic>>>(
        stream: store.watch(path),
        builder: (context, snapshot) {
          if (snapshot.connectionState == ConnectionState.waiting &&
              !snapshot.hasData) {
            return const Center(child: CircularProgressIndicator());
          }
          if (snapshot.hasError) {
            return Center(child: Text('Unable to load: ${snapshot.error}'));
          }
          final rows = snapshot.data ?? const <Map<String, dynamic>>[];
          if (rows.isEmpty) return Center(child: Text(empty));
          return ListView(
            padding: const EdgeInsets.all(20),
            children: rows.map(itemBuilder).toList(growable: false),
          );
        },
      );

  Widget _domainsTab() => Column(
        children: [
          _actionBar(
            'Custom domains + managed TLS',
            'Firebase Hosting provisions certificates; Cloudflare zones can be reconciled automatically from Hosting-required DNS records.',
            [
              FilledButton.icon(
                onPressed: store.demo ? null : _connectDomain,
                icon: const Icon(Icons.add_link_rounded),
                label: const Text('Connect domain'),
              ),
            ],
          ),
          Expanded(
            child: _streamList(
              'websiteDomains',
              empty: 'No custom domains connected.',
              itemBuilder: (row) {
                final active = row['active'] == true;
                return Card(
                  child: ListTile(
                    leading: CircleAvatar(
                      child: Icon(active ? Icons.lock_rounded : Icons.sync_rounded),
                    ),
                    title: Text(row['domain']?.toString() ?? row['id'].toString()),
                    subtitle: Text(
                      '${row['dnsProvider'] ?? 'manual'} · host ${row['hostState'] ?? 'provisioning'} · cert ${row['certState'] ?? 'provisioning'}',
                    ),
                    trailing: Wrap(
                      spacing: 6,
                      children: [
                        Chip(label: Text(active ? 'HTTPS active' : 'Provisioning')),
                        IconButton(
                          tooltip: 'Sync DNS/SSL state',
                          onPressed: () => _run(() async {
                            final result = await store.call(
                              'syncWebsiteCustomDomain',
                              {'domain': row['domain']},
                            );
                            if (mounted) {
                              ScaffoldMessenger.of(context).showSnackBar(
                                SnackBar(
                                  content: Text(
                                    result['active'] == true
                                        ? 'Domain and certificate are active.'
                                        : 'Domain reconciled; Firebase is still provisioning.',
                                  ),
                                ),
                              );
                            }
                          }),
                          icon: const Icon(Icons.sync_rounded),
                        ),
                      ],
                    ),
                  ),
                );
              },
            ),
          ),
        ],
      );

  Future<void> _connectDomain() async {
    final projects = await store.watch('websiteProjects').first;
    if (!mounted || projects.isEmpty) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Create and publish a website first.')),
        );
      }
      return;
    }
    var projectId = projects.first['id'].toString();
    var provider = 'manual';
    final domain = TextEditingController();
    final zone = TextEditingController();
    final accepted = await showDialog<bool>(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, update) => AlertDialog(
          title: const Text('Connect custom domain'),
          content: SizedBox(
            width: 560,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                DropdownButtonFormField<String>(
                  initialValue: projectId,
                  decoration: const InputDecoration(labelText: 'Published project'),
                  items: projects
                      .map(
                        (item) => DropdownMenuItem(
                          value: item['id'].toString(),
                          child: Text(item['title']?.toString() ?? item['id'].toString()),
                        ),
                      )
                      .toList(),
                  onChanged: (value) => projectId = value ?? projectId,
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: domain,
                  decoration: const InputDecoration(
                    labelText: 'Domain',
                    hintText: 'www.example.com',
                  ),
                ),
                const SizedBox(height: 12),
                DropdownButtonFormField<String>(
                  initialValue: provider,
                  decoration: const InputDecoration(labelText: 'DNS automation'),
                  items: const [
                    DropdownMenuItem(value: 'manual', child: Text('Manual DNS records')),
                    DropdownMenuItem(value: 'cloudflare', child: Text('Cloudflare automatic DNS')),
                  ],
                  onChanged: (value) => update(() => provider = value ?? 'manual'),
                ),
                if (provider == 'cloudflare') ...[
                  const SizedBox(height: 12),
                  TextField(
                    controller: zone,
                    decoration: const InputDecoration(labelText: 'Cloudflare Zone ID'),
                  ),
                ],
              ],
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context, false),
              child: const Text('Cancel'),
            ),
            FilledButton(
              onPressed: () => Navigator.pop(context, true),
              child: const Text('Provision'),
            ),
          ],
        ),
      ),
    );
    final domainValue = domain.text.trim();
    final zoneValue = zone.text.trim();
    domain.dispose();
    zone.dispose();
    if (accepted != true || domainValue.isEmpty) return;
    await _run(() async {
      final result = await store.call('provisionWebsiteCustomDomain', {
        'projectId': projectId,
        'domain': domainValue,
        'dnsProvider': provider,
        if (provider == 'cloudflare') 'zoneId': zoneValue,
      });
      if (!mounted) return;
      final required = (result['requiredDns'] as List? ?? const []).length;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            provider == 'cloudflare'
                ? 'DNS reconciliation started; Firebase will activate HTTPS after verification.'
                : '$required DNS records are required. Use Sync after adding them.',
          ),
        ),
      );
    });
  }

  Widget _assetsTab() => Column(
        children: [
          _actionBar(
            'Asset CDN',
            'Signed uploads are finalized into immutable, cacheable Firebase Storage URLs. Direct bucket writes remain denied.',
            [
              FilledButton.icon(
                onPressed: store.demo ? null : _uploadAsset,
                icon: const Icon(Icons.cloud_upload_rounded),
                label: const Text('Upload asset'),
              ),
            ],
          ),
          Expanded(
            child: _streamList(
              'websiteAssets',
              empty: 'No uploaded website assets.',
              itemBuilder: (row) => Card(
                child: ListTile(
                  leading: const Icon(Icons.perm_media_rounded),
                  title: Text(row['name']?.toString() ?? row['id'].toString()),
                  subtitle: Text(
                    '${row['contentType'] ?? ''} · ${_bytes(row['size'])}',
                  ),
                  trailing: IconButton(
                    tooltip: 'Copy CDN URL',
                    onPressed: () => Clipboard.setData(
                      ClipboardData(text: row['url']?.toString() ?? ''),
                    ),
                    icon: const Icon(Icons.copy_rounded),
                  ),
                ),
              ),
            ),
          ),
        ],
      );

  Future<void> _uploadAsset() async {
    final projects = await store.watch('websiteProjects').first;
    if (projects.isEmpty || !mounted) return;
    final picked = await FilePicker.platform.pickFiles(withData: true);
    final file = picked?.files.single;
    if (file == null || file.bytes == null) return;
    final type = _mime(file.name);
    if (type == null) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('That asset type is not supported.')),
        );
      }
      return;
    }
    var projectId = projects.first['id'].toString();
    if (projects.length > 1 && mounted) {
      final selected = await showDialog<String>(
        context: context,
        builder: (context) => SimpleDialog(
          title: const Text('Choose website'),
          children: projects
              .map(
                (project) => SimpleDialogOption(
                  onPressed: () => Navigator.pop(context, project['id'].toString()),
                  child: Text(project['title']?.toString() ?? project['id'].toString()),
                ),
              )
              .toList(),
        ),
      );
      if (selected == null) return;
      projectId = selected;
    }
    await _run(() async {
      final signed = await store.call('createWebsiteAssetUpload', {
        'projectId': projectId,
        'name': file.name,
        'contentType': type,
        'size': file.bytes!.length,
      });
      final response = await http.put(
        Uri.parse(signed['uploadUrl'].toString()),
        headers: {'Content-Type': type},
        body: file.bytes,
      );
      if (response.statusCode < 200 || response.statusCode >= 300) {
        throw Exception('Storage upload failed with HTTP ${response.statusCode}');
      }
      final finalized = await store.call('finalizeWebsiteAssetUpload', {
        'uploadId': signed['uploadId'],
      });
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Uploaded ${finalized['assetId']} to the CDN.')),
        );
      }
    });
  }

  Widget _cmsTab() => Column(
        children: [
          _actionBar(
            'Headless CMS + data bindings',
            'Typed collections can power repeaters through a component prop named dataCollection and {{field}} bindings inside text/URLs.',
            [
              FilledButton.icon(
                onPressed: store.demo ? null : _createCmsCollection,
                icon: const Icon(Icons.add_rounded),
                label: const Text('New collection'),
              ),
            ],
          ),
          Expanded(
            child: _streamList(
              'websiteCmsCollections',
              empty: 'No CMS collections.',
              itemBuilder: (row) {
                final fields = (row['fields'] as List? ?? const []);
                return Card(
                  child: ListTile(
                    leading: const Icon(Icons.table_chart_rounded),
                    title: Text(row['name']?.toString() ?? row['id'].toString()),
                    subtitle: Text(
                      '${fields.length} fields · public read ${row['publicRead'] == true ? 'on' : 'off'}',
                    ),
                    trailing: FilledButton.tonalIcon(
                      onPressed: () => _addCmsEntry(row),
                      icon: const Icon(Icons.add_rounded),
                      label: const Text('Entry'),
                    ),
                  ),
                );
              },
            ),
          ),
        ],
      );

  Future<void> _createCmsCollection() async {
    final id = TextEditingController(text: 'posts');
    final name = TextEditingController(text: 'Posts');
    final fields = TextEditingController(
      text: 'slug:text!, title:text!, body:longText, image:image',
    );
    var publicRead = true;
    final accepted = await showDialog<bool>(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, update) => AlertDialog(
          title: const Text('Create CMS collection'),
          content: SizedBox(
            width: 620,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                TextField(controller: id, decoration: const InputDecoration(labelText: 'Collection ID')),
                const SizedBox(height: 10),
                TextField(controller: name, decoration: const InputDecoration(labelText: 'Name')),
                const SizedBox(height: 10),
                TextField(
                  controller: fields,
                  decoration: const InputDecoration(
                    labelText: 'Fields',
                    helperText: 'field:type, use ! for required. Types: text, longText, number, boolean, date, datetime, url, image, reference, json',
                  ),
                ),
                SwitchListTile(
                  contentPadding: EdgeInsets.zero,
                  title: const Text('Allow published-site reads'),
                  value: publicRead,
                  onChanged: (value) => update(() => publicRead = value),
                ),
              ],
            ),
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancel')),
            FilledButton(onPressed: () => Navigator.pop(context, true), child: const Text('Create')),
          ],
        ),
      ),
    );
    final collectionId = id.text.trim();
    final collectionName = name.text.trim();
    final fieldText = fields.text.trim();
    id.dispose();
    name.dispose();
    fields.dispose();
    if (accepted != true || collectionId.isEmpty || collectionName.isEmpty) return;
    final parsed = fieldText.split(',').map((part) {
      final bits = part.trim().split(':');
      final fieldId = bits.first.trim();
      var type = bits.length > 1 ? bits[1].trim() : 'text';
      final required = type.endsWith('!');
      if (required) type = type.substring(0, type.length - 1);
      return {
        'id': fieldId,
        'label': _humanize(fieldId),
        'type': type,
        'required': required,
        'public': true,
      };
    }).where((field) => field['id'].toString().isNotEmpty).toList();
    await _run(() async {
      await store.call('saveWebsiteCmsCollection', {
        'collection': {
          'collectionId': collectionId,
          'name': collectionName,
          'fields': parsed,
          'slugField': parsed.any((field) => field['id'] == 'slug') ? 'slug' : null,
          'publicRead': publicRead,
        },
      });
    });
  }

  Future<void> _addCmsEntry(Map<String, dynamic> collection) async {
    final fields = (collection['fields'] as List? ?? const [])
        .whereType<Map>()
        .map((field) => Map<String, dynamic>.from(field))
        .toList();
    final controllers = {
      for (final field in fields)
        field['id'].toString(): TextEditingController(),
    };
    final values = await showDialog<Map<String, dynamic>>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text('Add ${collection['name'] ?? 'CMS'} entry'),
        content: SizedBox(
          width: 620,
          child: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: fields
                  .map(
                    (field) => Padding(
                      padding: const EdgeInsets.only(bottom: 10),
                      child: TextField(
                        controller: controllers[field['id'].toString()],
                        decoration: InputDecoration(
                          labelText: field['label']?.toString() ?? field['id'].toString(),
                          helperText: field['type']?.toString(),
                        ),
                      ),
                    ),
                  )
                  .toList(),
            ),
          ),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context), child: const Text('Cancel')),
          FilledButton(
            onPressed: () {
              final result = <String, dynamic>{};
              for (final field in fields) {
                final key = field['id'].toString();
                final raw = controllers[key]!.text.trim();
                result[key] = switch (field['type']) {
                  'number' => double.tryParse(raw),
                  'boolean' => raw.toLowerCase() == 'true',
                  _ => raw,
                };
              }
              Navigator.pop(context, result);
            },
            child: const Text('Save'),
          ),
        ],
      ),
    );
    for (final controller in controllers.values) {
      controller.dispose();
    }
    if (values == null) return;
    await _run(() async {
      await store.call('upsertWebsiteCmsEntry', {
        'collectionId': collection['collectionId'] ?? collection['id'],
        'values': values,
        'published': true,
      });
    });
  }

  Widget _pluginsTab() {
    final marketplace = (_plugins['plugins'] as List? ?? const [])
        .whereType<Map>()
        .map((item) => Map<String, dynamic>.from(item))
        .toList();
    return Column(
      children: [
        _actionBar(
          'Third-party plugin sandbox',
          'Plugins run at publisher HTTPS endpoints with explicit capabilities. They may return data or validated JSON fragments, never arbitrary Dart/JS inside the customer app.',
          [
            OutlinedButton.icon(
              onPressed: store.demo ? null : _publishPlugin,
              icon: const Icon(Icons.publish_rounded),
              label: const Text('Publish plugin'),
            ),
            FilledButton.icon(
              onPressed: store.demo ? null : _refreshOwnerData,
              icon: const Icon(Icons.refresh_rounded),
              label: const Text('Marketplace'),
            ),
          ],
        ),
        Expanded(
          child: ListView(
            padding: const EdgeInsets.all(20),
            children: marketplace.isEmpty
                ? [const Center(child: Text('No published plugins yet.'))]
                : marketplace
                    .map(
                      (plugin) => Card(
                        child: ListTile(
                          leading: const Icon(Icons.extension_rounded),
                          title: Text(plugin['name']?.toString() ?? plugin['pluginId'].toString()),
                          subtitle: Text(
                            '${plugin['publisher'] ?? ''} · ${(plugin['capabilities'] as List? ?? const []).join(', ')}',
                          ),
                          trailing: FilledButton.tonal(
                            onPressed: () => _run(() async {
                              await store.call('installWebsitePlugin', {
                                'pluginId': plugin['pluginId'],
                              });
                            }),
                            child: const Text('Install'),
                          ),
                        ),
                      ),
                    )
                    .toList(),
          ),
        ),
      ],
    );
  }

  Future<void> _publishPlugin() async {
    final id = TextEditingController();
    final name = TextEditingController();
    final publisher = TextEditingController();
    final endpoint = TextEditingController();
    final accepted = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Publish remote plugin'),
        content: SizedBox(
          width: 560,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(controller: id, decoration: const InputDecoration(labelText: 'Plugin ID')),
              const SizedBox(height: 10),
              TextField(controller: name, decoration: const InputDecoration(labelText: 'Plugin name')),
              const SizedBox(height: 10),
              TextField(controller: publisher, decoration: const InputDecoration(labelText: 'Publisher')),
              const SizedBox(height: 10),
              TextField(controller: endpoint, decoration: const InputDecoration(labelText: 'HTTPS runtime endpoint')),
            ],
          ),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancel')),
          FilledButton(onPressed: () => Navigator.pop(context, true), child: const Text('Publish')),
        ],
      ),
    );
    final values = [id.text.trim(), name.text.trim(), publisher.text.trim(), endpoint.text.trim()];
    id.dispose();
    name.dispose();
    publisher.dispose();
    endpoint.dispose();
    if (accepted != true || values.any((value) => value.isEmpty)) return;
    await _run(() async {
      await store.call('publishWebsitePlugin', {
        'manifest': {
          'pluginId': values[0],
          'name': values[1],
          'publisher': values[2],
          'description': 'Website runtime plugin',
          'endpoint': values[3],
          'capabilities': ['site.fragment', 'site.data'],
          'publicRuntime': true,
          'version': '1.0.0',
        },
      });
      await _refreshOwnerData();
    });
  }

  Widget _collaborationTab() => Column(
        children: [
          _actionBar(
            'OpSet CRDT collaboration',
            'Every editor patch is stored as an immutable operation and deterministically materialized. Presence is ephemeral; checkpoints advance the garbage-collection epoch.',
            const [],
          ),
          Expanded(
            child: StreamBuilder<List<Map<String, dynamic>>>(
              stream: store.watch('websiteProjects'),
              builder: (context, snapshot) {
                final projects = snapshot.data ?? const <Map<String, dynamic>>[];
                if (projects.isEmpty) return const Center(child: Text('No websites yet.'));
                return ListView(
                  padding: const EdgeInsets.all(20),
                  children: projects.map((project) {
                    final id = project['id'].toString();
                    return Card(
                      child: ExpansionTile(
                        leading: const Icon(Icons.group_work_rounded),
                        title: Text(project['title']?.toString() ?? id),
                        subtitle: Text(
                          'Revision ${project['revision'] ?? 1} · epoch ${project['collaborationEpoch'] ?? 1} · ${project['collaborationOps'] ?? 0} ops',
                        ),
                        children: [
                          SizedBox(
                            height: 180,
                            child: _streamList(
                              'websiteCollaboration/$id/presence',
                              empty: 'No active collaborators.',
                              itemBuilder: (presence) => ListTile(
                                leading: const CircleAvatar(child: Icon(Icons.person_rounded)),
                                title: Text(presence['actorId']?.toString() ?? presence['id'].toString()),
                                subtitle: Text('Selected ${presence['selectedNodeId'] ?? 'canvas'}'),
                              ),
                            ),
                          ),
                          Padding(
                            padding: const EdgeInsets.all(12),
                            child: FilledButton.tonalIcon(
                              onPressed: store.demo
                                  ? null
                                  : () => _run(() async {
                                        await store.call('checkpointWebsiteCollaboration', {'projectId': id});
                                      }),
                              icon: const Icon(Icons.save_rounded),
                              label: const Text('Checkpoint collaboration epoch'),
                            ),
                          ),
                        ],
                      ),
                    );
                  }).toList(),
                );
              },
            ),
          ),
        ],
      );

  Widget _experimentsTab() => Column(
        children: [
          _actionBar(
            'Runtime A/B experiments',
            'Variants point at immutable published versions. Visitor assignment is sticky, privacy-hashed and weighted in basis points.',
            [
              FilledButton.icon(
                onPressed: store.demo ? null : _createExperiment,
                icon: const Icon(Icons.add_rounded),
                label: const Text('New experiment'),
              ),
            ],
          ),
          Expanded(
            child: _streamList(
              'websiteExperiments',
              empty: 'No experiments configured.',
              itemBuilder: (row) => Card(
                child: ListTile(
                  leading: const Icon(Icons.science_rounded),
                  title: Text(row['name']?.toString() ?? row['id'].toString()),
                  subtitle: Text(
                    '${row['status'] ?? 'draft'} · ${row['path'] ?? '*'} · ${(row['variants'] as List? ?? const []).length} variants',
                  ),
                ),
              ),
            ),
          ),
        ],
      );

  Future<void> _createExperiment() async {
    final projects = await store.watch('websiteProjects').first;
    if (projects.isEmpty || !mounted) return;
    var projectId = projects.first['id'].toString();
    final id = TextEditingController(text: 'hero_test');
    final name = TextEditingController(text: 'Hero experiment');
    final versionA = TextEditingController(text: '1');
    final versionB = TextEditingController(text: '2');
    final accepted = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Create 50/50 experiment'),
        content: SizedBox(
          width: 560,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              DropdownButtonFormField<String>(
                initialValue: projectId,
                items: projects
                    .map((project) => DropdownMenuItem(
                          value: project['id'].toString(),
                          child: Text(project['title']?.toString() ?? project['id'].toString()),
                        ))
                    .toList(),
                onChanged: (value) => projectId = value ?? projectId,
                decoration: const InputDecoration(labelText: 'Project'),
              ),
              const SizedBox(height: 10),
              TextField(controller: id, decoration: const InputDecoration(labelText: 'Experiment ID')),
              const SizedBox(height: 10),
              TextField(controller: name, decoration: const InputDecoration(labelText: 'Name')),
              const SizedBox(height: 10),
              Row(
                children: [
                  Expanded(child: TextField(controller: versionA, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'Version A'))),
                  const SizedBox(width: 10),
                  Expanded(child: TextField(controller: versionB, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'Version B'))),
                ],
              ),
            ],
          ),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancel')),
          FilledButton(onPressed: () => Navigator.pop(context, true), child: const Text('Start')),
        ],
      ),
    );
    final experimentId = id.text.trim();
    final experimentName = name.text.trim();
    final a = int.tryParse(versionA.text.trim());
    final b = int.tryParse(versionB.text.trim());
    id.dispose();
    name.dispose();
    versionA.dispose();
    versionB.dispose();
    if (accepted != true || a == null || b == null) return;
    await _run(() async {
      await store.call('saveWebsiteExperiment', {
        'experiment': {
          'experimentId': experimentId,
          'name': experimentName,
          'projectId': projectId,
          'status': 'active',
          'path': '*',
          'trafficBps': 10000,
          'goals': ['conversion', 'cta_click', 'form_submit'],
          'variants': [
            {'id': 'a', 'version': a, 'weight': 5000},
            {'id': 'b', 'version': b, 'weight': 5000},
          ],
        },
      });
    });
  }

  Widget _growthTab() {
    final daily = (_growth['daily'] as List? ?? const []).whereType<Map>().toList();
    final experiments = (_growth['experiments'] as List? ?? const []).whereType<Map>().toList();
    final forms = (_growth['forms'] as List? ?? const []).whereType<Map>().toList();
    final profile = _payout['profile'] is Map ? Map<String, dynamic>.from(_payout['profile'] as Map) : null;
    final payouts = (_payout['payouts'] as List? ?? const []).whereType<Map>().toList();
    final views = daily.fold<num>(0, (sum, row) => sum + ((row['views'] as num?) ?? 0));
    final conversions = daily.fold<num>(0, (sum, row) => sum + ((row['conversions'] as num?) ?? 0));
    return ListView(
      padding: const EdgeInsets.all(20),
      children: [
        _actionBar(
          'Conversion analytics + creator payouts',
          'Analytics are aggregate and visitor IDs are HMAC-hashed. Creator payouts use verified Paystack transfer state before earnings are closed as paid.',
          [
            OutlinedButton.icon(
              onPressed: store.demo ? null : _configurePayout,
              icon: const Icon(Icons.account_balance_rounded),
              label: Text(profile == null ? 'Configure payout' : 'Update payout'),
            ),
            FilledButton.icon(
              onPressed: store.demo ? null : () => _run(() async {
                final result = await store.call('runWebsiteCreatorPayout');
                if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Payout state: ${result['state']}')));
                await _refreshOwnerData();
              }),
              icon: const Icon(Icons.send_rounded),
              label: const Text('Run payout'),
            ),
          ],
        ),
        const SizedBox(height: 16),
        Wrap(
          spacing: 12,
          runSpacing: 12,
          children: [
            _metric('Page views', '$views', Icons.visibility_rounded),
            _metric('Conversions', '$conversions', Icons.ads_click_rounded),
            _metric('Experiment rows', '${experiments.length}', Icons.science_rounded),
            _metric('Form-stat rows', '${forms.length}', Icons.dynamic_form_rounded),
            _metric('Payouts', '${payouts.length}', Icons.payments_rounded),
          ],
        ),
        const SizedBox(height: 16),
        Card(
          child: ListTile(
            leading: const Icon(Icons.verified_user_rounded),
            title: Text(profile == null ? 'Creator payout not configured' : 'Paystack payout configured'),
            subtitle: Text(profile == null
                ? 'Add a Kenya transfer recipient before automated settlement can run.'
                : '${profile['recipientType']} · ${profile['maskedAccount']} · minimum ${kes((profile['minPayoutMinor'] as num?) ?? 0)}'),
          ),
        ),
        const SizedBox(height: 14),
        const Text('Recent payout jobs', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
        ...payouts.take(20).map((row) => Card(
              child: ListTile(
                title: Text(row['reference']?.toString() ?? row['id'].toString()),
                subtitle: Text('${row['state'] ?? ''} · ${row['currency'] ?? 'KES'}'),
                trailing: Text(kes((row['amountMinor'] as num?) ?? 0)),
              ),
            )),
      ],
    );
  }

  Future<void> _configurePayout() async {
    final name = TextEditingController();
    final account = TextEditingController();
    final bankCode = TextEditingController(text: 'MPESA');
    final threshold = TextEditingController(text: '1000');
    var type = 'mobile_money';
    final accepted = await showDialog<bool>(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, update) => AlertDialog(
          title: const Text('Configure creator payout'),
          content: SizedBox(
            width: 560,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                TextField(controller: name, decoration: const InputDecoration(labelText: 'Recipient name')),
                const SizedBox(height: 10),
                DropdownButtonFormField<String>(
                  initialValue: type,
                  items: const [
                    DropdownMenuItem(value: 'mobile_money', child: Text('Mobile money')),
                    DropdownMenuItem(value: 'mobile_money_business', child: Text('Business mobile money')),
                    DropdownMenuItem(value: 'kepss', child: Text('KEPSS bank transfer')),
                  ],
                  onChanged: (value) => update(() => type = value ?? type),
                  decoration: const InputDecoration(labelText: 'Paystack recipient type'),
                ),
                const SizedBox(height: 10),
                TextField(controller: account, decoration: const InputDecoration(labelText: 'Account / phone number')),
                const SizedBox(height: 10),
                TextField(controller: bankCode, decoration: const InputDecoration(labelText: 'Bank / mobile-money code')),
                const SizedBox(height: 10),
                TextField(controller: threshold, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'Minimum payout KES')),
              ],
            ),
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancel')),
            FilledButton(onPressed: () => Navigator.pop(context, true), child: const Text('Verify with Paystack')),
          ],
        ),
      ),
    );
    final recipientName = name.text.trim();
    final accountNumber = account.text.trim();
    final code = bankCode.text.trim();
    final minKes = double.tryParse(threshold.text.trim()) ?? 1000;
    name.dispose();
    account.dispose();
    bankCode.dispose();
    threshold.dispose();
    if (accepted != true || recipientName.isEmpty || accountNumber.isEmpty || code.isEmpty) return;
    await _run(() async {
      await store.call('configureWebsiteCreatorPayout', {
        'profile': {
          'type': type,
          'currency': 'KES',
          'name': recipientName,
          'accountNumber': accountNumber,
          'bankCode': code,
          'minPayoutMinor': (minKes * 100).round(),
          'active': true,
        },
      });
      await _refreshOwnerData();
    });
  }

  Widget _actionBar(String title, String subtitle, List<Widget> actions) =>
      Material(
        color: Colors.white,
        child: Padding(
          padding: const EdgeInsets.all(18),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.center,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(title, style: const TextStyle(fontSize: 20, fontWeight: FontWeight.bold)),
                    const SizedBox(height: 4),
                    Text(subtitle, style: const TextStyle(color: Color(0xFF64748B))),
                  ],
                ),
              ),
              if (actions.isNotEmpty)
                Wrap(spacing: 8, runSpacing: 8, children: actions),
            ],
          ),
        ),
      );

  Widget _metric(String label, String value, IconData icon) => SizedBox(
        width: 210,
        child: Card(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Row(
              children: [
                Icon(icon, color: const Color(0xFF2563EB)),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(label, style: const TextStyle(fontSize: 11, color: Color(0xFF64748B))),
                      Text(value, style: const TextStyle(fontSize: 17, fontWeight: FontWeight.bold)),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      );

  String? _mime(String name) {
    final ext = name.split('.').last.toLowerCase();
    return const {
      'jpg': 'image/jpeg',
      'jpeg': 'image/jpeg',
      'png': 'image/png',
      'webp': 'image/webp',
      'gif': 'image/gif',
      'avif': 'image/avif',
      'mp4': 'video/mp4',
      'webm': 'video/webm',
      'pdf': 'application/pdf',
      'woff2': 'font/woff2',
    }[ext];
  }

  String _bytes(dynamic input) {
    final bytes = (input as num?)?.toDouble() ?? 0;
    if (bytes >= 1024 * 1024) return '${(bytes / 1024 / 1024).toStringAsFixed(1)} MB';
    if (bytes >= 1024) return '${(bytes / 1024).toStringAsFixed(1)} KB';
    return '${bytes.toStringAsFixed(0)} B';
  }

  String _humanize(String value) => value
      .replaceAll('_', ' ')
      .split(' ')
      .where((part) => part.isNotEmpty)
      .map((part) => '${part[0].toUpperCase()}${part.substring(1)}')
      .join(' ');
}
