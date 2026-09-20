import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:url_launcher/url_launcher.dart';

import '../suite.dart';
import 'website_builder_runtime.dart';

class WebsiteBuilderModuleScreen extends StatefulWidget {
  final SuiteStore store;

  const WebsiteBuilderModuleScreen({super.key, required this.store});

  @override
  State<WebsiteBuilderModuleScreen> createState() =>
      _WebsiteBuilderModuleScreenState();
}

class _WebsiteBuilderModuleScreenState extends State<WebsiteBuilderModuleScreen> {
  static const _componentTypes = <String>[
    'section',
    'container',
    'row',
    'column',
    'wrap',
    'heading',
    'text',
    'image',
    'button',
    'card',
    'grid',
    'navbar',
    'hero',
    'features',
    'pricing',
    'testimonials',
    'cta',
    'footer',
    'form',
    'divider',
    'spacer',
  ];

  int _tab = 0;
  bool _busy = false;
  String? _selectedProjectId;
  String? _selectedNodeId;
  String? _selectedPageId;
  double _previewWidth = 1200;
  Map<String, dynamic> _marketplace = const {'templates': []};
  Map<String, dynamic> _creator = const {};
  Map<String, dynamic>? _demoProject;

  SuiteStore get store => widget.store;

  @override
  void initState() {
    super.initState();
    if (store.demo) {
      _demoProject = {
        'id': 'demo_site',
        'projectId': 'demo_site',
        'title': 'TeknTandao Studio Demo',
        'publicId': 'tekntandao-studio-demo',
        'revision': 1,
        'publishedVersion': 0,
        'status': 'draft',
        'draft': _demoDocument(),
      };
      _marketplace = {
        'templates': [
          {
            'templateId': 'demo_saas',
            'name': 'African SaaS Launch',
            'description': 'Premium multi-section launch site with mobile-first conversion blocks.',
            'category': 'SaaS',
            'creatorName': 'TeknTandao Studio',
            'priceMinor': 0,
            'currency': 'KES',
            'license': 'free',
            'version': 1,
            'sales': 28,
            'installs': 130,
          },
        ],
      };
      _creator = {
        'templates': [],
        'earnings': {'pendingMinor': 0, 'paidMinor': 0, 'sales': 0},
        'payoutState': 'manual_or_future_provider_payout',
      };
    } else {
      _refreshMarketplace();
      _refreshCreator();
    }
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

  Future<void> _refreshMarketplace() async {
    final result = await store.call('getWebsiteTemplateMarketplace');
    if (mounted) setState(() => _marketplace = result);
  }

  Future<void> _refreshCreator() async {
    try {
      final result = await store.call('getWebsiteCreatorDashboard');
      if (mounted) setState(() => _creator = result);
    } catch (_) {
      // Creator analytics are owner-only; collaborators can still use the editor.
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF1F5F9),
      appBar: AppBar(
        title: const Row(
          children: [
            Icon(Icons.web_stories_rounded, color: Color(0xFF2563EB)),
            SizedBox(width: 10),
            Text('Website Studio'),
          ],
        ),
        actions: [
          if (_busy)
            const Padding(
              padding: EdgeInsets.symmetric(horizontal: 16),
              child: Center(
                child: SizedBox(
                  width: 18,
                  height: 18,
                  child: CircularProgressIndicator(strokeWidth: 2),
                ),
              ),
            ),
          SegmentedButton<int>(
            segments: const [
              ButtonSegment(value: 0, icon: Icon(Icons.design_services_rounded), label: Text('Builder')),
              ButtonSegment(value: 1, icon: Icon(Icons.storefront_rounded), label: Text('Templates')),
              ButtonSegment(value: 2, icon: Icon(Icons.monetization_on_rounded), label: Text('Creator')),
            ],
            selected: {_tab},
            onSelectionChanged: (selection) => setState(() => _tab = selection.first),
          ),
          const SizedBox(width: 16),
        ],
      ),
      body: switch (_tab) {
        1 => _marketplaceTab(),
        2 => _creatorTab(),
        _ => _builderTab(),
      },
    );
  }

  Widget _builderTab() {
    if (store.demo) {
      return _projectWorkspace(_demoProject!);
    }
    return StreamBuilder<List<Map<String, dynamic>>>(
      stream: store.watch('websiteProjects'),
      builder: (context, snapshot) {
        if (!snapshot.hasData) {
          return const Center(child: CircularProgressIndicator());
        }
        final projects = snapshot.data!;
        if (projects.isEmpty) return _emptyProjects();
        final selected = projects.firstWhere(
          (item) => item['id'] == _selectedProjectId,
          orElse: () => projects.first,
        );
        return _projectWorkspace(selected, projects: projects);
      },
    );
  }

  Widget _emptyProjects() => Center(
        child: Card(
          child: Padding(
            padding: const EdgeInsets.all(32),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Icon(Icons.web_asset_rounded, size: 54, color: Color(0xFF2563EB)),
                const SizedBox(height: 12),
                const Text(
                  'Build from JSON, not from compiled screens',
                  style: TextStyle(fontSize: 22, fontWeight: FontWeight.bold),
                ),
                const SizedBox(height: 8),
                const SizedBox(
                  width: 560,
                  child: Text(
                    'The visual tree is the source of truth. Publish a new JSON snapshot and every generated Flutter client updates from Firestore without rebuilding the app.',
                    textAlign: TextAlign.center,
                  ),
                ),
                const SizedBox(height: 20),
                FilledButton.icon(
                  onPressed: _createProject,
                  icon: const Icon(Icons.add_rounded),
                  label: const Text('Create website'),
                ),
              ],
            ),
          ),
        ),
      );

  Widget _projectWorkspace(
    Map<String, dynamic> project, {
    List<Map<String, dynamic>> projects = const [],
  }) {
    final document = siteMap(project['draft']);
    final pages = siteList(document['pages']);
    final pageId = _selectedPageId != null && pages.any((p) => p['id'] == _selectedPageId)
        ? _selectedPageId!
        : pages.firstOrNull?['id']?.toString() ?? '';
    final selectedNode = _selectedNodeId == null
        ? null
        : findWebsiteNode(document, _selectedNodeId!);

    return Column(
      children: [
        _builderToolbar(project, projects, document, pages, pageId),
        Expanded(
          child: LayoutBuilder(
            builder: (context, constraints) {
              if (constraints.maxWidth < 1050) {
                return ListView(
                  padding: const EdgeInsets.all(12),
                  children: [
                    SizedBox(height: 300, child: _paletteAndPages(project, pages, pageId)),
                    const SizedBox(height: 12),
                    SizedBox(height: 720, child: _canvas(project, document, pageId)),
                    const SizedBox(height: 12),
                    SizedBox(height: 420, child: _inspector(project, document, selectedNode)),
                  ],
                );
              }
              return Row(
                children: [
                  SizedBox(width: 250, child: _paletteAndPages(project, pages, pageId)),
                  Expanded(child: _canvas(project, document, pageId)),
                  SizedBox(width: 310, child: _inspector(project, document, selectedNode)),
                ],
              );
            },
          ),
        ),
      ],
    );
  }

  Widget _builderToolbar(
    Map<String, dynamic> project,
    List<Map<String, dynamic>> projects,
    Map<String, dynamic> document,
    List<Map<String, dynamic>> pages,
    String pageId,
  ) {
    return Material(
      color: Colors.white,
      elevation: 1,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        child: Row(
          children: [
            if (projects.isNotEmpty)
              SizedBox(
                width: 220,
                child: DropdownButtonFormField<String>(
                  initialValue: project['id']?.toString(),
                  decoration: const InputDecoration(labelText: 'Project', isDense: true),
                  items: projects
                      .map((item) => DropdownMenuItem(
                            value: item['id']?.toString(),
                            child: Text(item['title']?.toString() ?? 'Website'),
                          ))
                      .toList(),
                  onChanged: (value) => setState(() {
                    _selectedProjectId = value;
                    _selectedNodeId = null;
                    _selectedPageId = null;
                  }),
                ),
              ),
            const SizedBox(width: 8),
            IconButton(
              onPressed: _createProject,
              tooltip: 'New project',
              icon: const Icon(Icons.add_box_outlined),
            ),
            const VerticalDivider(),
            _viewportButton('Mobile', 390, Icons.phone_iphone_rounded),
            _viewportButton('Tablet', 820, Icons.tablet_mac_rounded),
            _viewportButton('Desktop', 1200, Icons.desktop_windows_rounded),
            const Spacer(),
            Text(
              'r${project['revision'] ?? 1} · ${project['status'] ?? 'draft'}',
              style: const TextStyle(color: Color(0xFF64748B), fontWeight: FontWeight.w600),
            ),
            const SizedBox(width: 8),
            IconButton(
              onPressed: () => _publishTemplate(project),
              tooltip: 'Sell as template',
              icon: const Icon(Icons.sell_rounded),
            ),
            OutlinedButton.icon(
              onPressed: () => _showJson(document),
              icon: const Icon(Icons.data_object_rounded),
              label: const Text('JSON'),
            ),
            const SizedBox(width: 8),
            OutlinedButton.icon(
              onPressed: () => _aiGenerate(project),
              icon: const Icon(Icons.auto_awesome_rounded),
              label: const Text('AI Generate'),
            ),
            const SizedBox(width: 8),
            OutlinedButton.icon(
              onPressed: () => _exportScaffold(project),
              icon: const Icon(Icons.code_rounded),
              label: const Text('Export Flutter'),
            ),
            const SizedBox(width: 8),
            FilledButton.icon(
              onPressed: () => _publish(project),
              icon: const Icon(Icons.publish_rounded),
              label: const Text('Publish live'),
            ),
          ],
        ),
      ),
    );
  }

  Widget _viewportButton(String tooltip, double width, IconData icon) => IconButton(
        tooltip: '$tooltip preview',
        onPressed: () => setState(() => _previewWidth = width),
        color: (_previewWidth - width).abs() < 10 ? const Color(0xFF2563EB) : null,
        icon: Icon(icon),
      );

  Widget _paletteAndPages(
    Map<String, dynamic> project,
    List<Map<String, dynamic>> pages,
    String pageId,
  ) {
    return Material(
      color: Colors.white,
      child: ListView(
        padding: const EdgeInsets.all(12),
        children: [
          Row(
            children: [
              const Expanded(
                child: Text('Pages', style: TextStyle(fontWeight: FontWeight.bold)),
              ),
              IconButton(
                onPressed: () => _addPage(project),
                tooltip: 'Add page',
                icon: const Icon(Icons.add_rounded),
              ),
            ],
          ),
          for (final page in pages)
            ListTile(
              dense: true,
              selected: page['id'] == pageId,
              leading: const Icon(Icons.description_outlined, size: 18),
              title: Text(page['name']?.toString() ?? 'Page'),
              subtitle: Text(page['path']?.toString() ?? '/'),
              onTap: () => setState(() {
                _selectedPageId = page['id']?.toString();
                _selectedNodeId = siteMap(page['root'])['id']?.toString();
              }),
            ),
          const Divider(height: 28),
          const Text('Components', style: TextStyle(fontWeight: FontWeight.bold)),
          const SizedBox(height: 6),
          const Text(
            'Drag onto a container or click to add to the selected container.',
            style: TextStyle(fontSize: 11, color: Color(0xFF64748B)),
          ),
          const SizedBox(height: 10),
          Wrap(
            spacing: 6,
            runSpacing: 6,
            children: _componentTypes.map((type) {
              final chip = ActionChip(
                avatar: Icon(_componentIcon(type), size: 16),
                label: Text(_humanize(type), style: const TextStyle(fontSize: 11)),
                onPressed: () => _addComponent(project, type),
              );
              return Draggable<String>(
                data: type,
                feedback: Material(
                  elevation: 4,
                  borderRadius: BorderRadius.circular(20),
                  child: Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                    child: Text(_humanize(type)),
                  ),
                ),
                child: chip,
              );
            }).toList(),
          ),
        ],
      ),
    );
  }

  Widget _canvas(
    Map<String, dynamic> project,
    Map<String, dynamic> document,
    String pageId,
  ) {
    return ColoredBox(
      color: const Color(0xFFE2E8F0),
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(24),
        scrollDirection: Axis.horizontal,
        child: Align(
          alignment: Alignment.topCenter,
          child: AnimatedContainer(
            duration: const Duration(milliseconds: 220),
            width: _previewWidth,
            constraints: const BoxConstraints(minHeight: 640),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(12),
              boxShadow: const [BoxShadow(blurRadius: 18, color: Color(0x22000000))],
            ),
            clipBehavior: Clip.antiAlias,
            child: JsonWebsiteRuntime(
              document: document,
              pageId: pageId,
              editable: true,
              selectedNodeId: _selectedNodeId,
              onSelectNode: (id) => setState(() => _selectedNodeId = id),
              onDropComponent: (parentId, type) =>
                  _addComponent(project, type, parentId: parentId),
            ),
          ),
        ),
      ),
    );
  }

  Widget _inspector(
    Map<String, dynamic> project,
    Map<String, dynamic> document,
    Map<String, dynamic>? node,
  ) {
    final theme = siteMap(document['theme']);
    return Material(
      color: Colors.white,
      child: ListView(
        padding: const EdgeInsets.all(14),
        children: [
          const Text('Inspector', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 18)),
          const SizedBox(height: 12),
          if (node == null)
            const Text('Select a component on the canvas.')
          else ...[
            Row(
              children: [
                Icon(_componentIcon(node['type']?.toString() ?? 'container')),
                const SizedBox(width: 8),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(_humanize(node['type']?.toString() ?? 'component'), style: const TextStyle(fontWeight: FontWeight.bold)),
                      Text(node['id']?.toString() ?? '', style: const TextStyle(fontSize: 11, color: Color(0xFF64748B))),
                    ],
                  ),
                ),
                IconButton(
                  onPressed: node['type'] == 'page' ? null : () => _removeNode(project, node['id'].toString()),
                  tooltip: 'Delete component',
                  icon: const Icon(Icons.delete_outline_rounded, color: Colors.red),
                ),
              ],
            ),
            const SizedBox(height: 12),
            _propField(project, node, 'text', 'Text'),
            _propField(project, node, 'title', 'Title'),
            _propField(project, node, 'subtitle', 'Subtitle'),
            _propField(project, node, 'eyebrow', 'Eyebrow'),
            _propField(project, node, 'imageUrl', 'Image URL'),
            _propField(project, node, 'brand', 'Brand'),
            _propField(project, node, 'copyright', 'Copyright'),
            _numberStyleField(project, node, 'padding', 'Padding'),
            _numberStyleField(project, node, 'gap', 'Gap'),
            _numberStyleField(project, node, 'radius', 'Radius'),
            _numberStyleField(project, node, 'fontSize', 'Font size'),
            _styleField(project, node, 'backgroundColor', 'Background #RRGGBB'),
            _styleField(project, node, 'foregroundColor', 'Text #RRGGBB'),
            const SizedBox(height: 10),
            OutlinedButton.icon(
              onPressed: () => _editAction(project, node),
              icon: const Icon(Icons.touch_app_rounded),
              label: const Text('Edit click action'),
            ),
          ],
          const Divider(height: 30),
          const Text('Global theme', style: TextStyle(fontWeight: FontWeight.bold)),
          const SizedBox(height: 8),
          _themeField(project, theme, 'primaryColor', 'Primary'),
          _themeField(project, theme, 'backgroundColor', 'Background'),
          _themeField(project, theme, 'textColor', 'Text'),
        ],
      ),
    );
  }

  Widget _propField(
    Map<String, dynamic> project,
    Map<String, dynamic> node,
    String key,
    String label,
  ) {
    final props = siteMap(node['props']);
    if (!props.containsKey(key) && !['text', 'title'].contains(key)) {
      return const SizedBox.shrink();
    }
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: TextFormField(
        key: ValueKey('${node['id']}-$key-${props[key]}'),
        initialValue: props[key]?.toString() ?? '',
        decoration: InputDecoration(labelText: label, isDense: true),
        onFieldSubmitted: (value) => _patch(project, {
          'op': 'updateNode',
          'nodeId': node['id'],
          'props': {key: value},
        }),
      ),
    );
  }

  Widget _styleField(
    Map<String, dynamic> project,
    Map<String, dynamic> node,
    String key,
    String label,
  ) {
    final style = siteMap(node['style']);
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: TextFormField(
        key: ValueKey('${node['id']}-$key-${style[key]}'),
        initialValue: style[key]?.toString() ?? '',
        decoration: InputDecoration(labelText: label, isDense: true),
        onFieldSubmitted: (value) {
          if (value.trim().isEmpty) return;
          _patch(project, {
            'op': 'updateNode',
            'nodeId': node['id'],
            'style': {key: value.trim()},
          });
        },
      ),
    );
  }

  Widget _numberStyleField(
    Map<String, dynamic> project,
    Map<String, dynamic> node,
    String key,
    String label,
  ) {
    final style = siteMap(node['style']);
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: TextFormField(
        key: ValueKey('${node['id']}-$key-${style[key]}'),
        initialValue: style[key]?.toString() ?? '',
        decoration: InputDecoration(labelText: label, isDense: true),
        keyboardType: TextInputType.number,
        onFieldSubmitted: (value) {
          final parsed = double.tryParse(value);
          if (parsed == null) return;
          _patch(project, {
            'op': 'updateNode',
            'nodeId': node['id'],
            'style': {key: parsed},
          });
        },
      ),
    );
  }

  Widget _themeField(
    Map<String, dynamic> project,
    Map<String, dynamic> theme,
    String key,
    String label,
  ) => Padding(
        padding: const EdgeInsets.only(bottom: 10),
        child: TextFormField(
          key: ValueKey('theme-$key-${theme[key]}'),
          initialValue: theme[key]?.toString() ?? '',
          decoration: InputDecoration(labelText: '$label color', isDense: true),
          onFieldSubmitted: (value) {
            final next = {...theme, key: value.trim()};
            _patch(project, {'op': 'setTheme', 'theme': next});
          },
        ),
      );

  Future<void> _createProject() async {
    final name = TextEditingController(text: 'My Website');
    final slug = TextEditingController();
    final accepted = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Create website'),
        content: SizedBox(
          width: 460,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(controller: name, decoration: const InputDecoration(labelText: 'Website name')),
              const SizedBox(height: 12),
              TextField(controller: slug, decoration: const InputDecoration(labelText: 'Public id (optional)', hintText: 'my-company')),
            ],
          ),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancel')),
          FilledButton(onPressed: () => Navigator.pop(context, true), child: const Text('Create')),
        ],
      ),
    );
    final title = name.text.trim();
    final publicId = slug.text.trim();
    name.dispose();
    slug.dispose();
    if (accepted != true || title.isEmpty) return;
    if (store.demo) {
      setState(() {
        _demoProject = {
          'id': 'demo_${DateTime.now().millisecondsSinceEpoch}',
          'title': title,
          'publicId': publicId.isEmpty ? 'demo-site' : publicId,
          'revision': 1,
          'publishedVersion': 0,
          'status': 'draft',
          'draft': _demoDocument(title),
        };
        _selectedProjectId = _demoProject!['id'].toString();
        _selectedNodeId = null;
      });
      return;
    }
    await _run(() async {
      final result = await store.call('createWebsiteProject', {
        'title': title,
        if (publicId.isNotEmpty) 'publicId': publicId,
      });
      if (mounted) setState(() => _selectedProjectId = result['projectId']?.toString());
    });
  }

  Future<void> _patch(Map<String, dynamic> project, Map<String, dynamic> patch) async {
    if (store.demo) {
      setState(() {
        final document = siteMap(_demoProject!['draft']);
        _applyLocalPatch(document, patch);
        _demoProject!['draft'] = document;
        _demoProject!['revision'] = (_demoProject!['revision'] as int) + 1;
        _demoProject!['status'] = 'modified';
      });
      return;
    }
    await _run(() async {
      await store.call('patchWebsiteProject', {
        'projectId': project['id'],
        'expectedRevision': project['revision'],
        'patch': patch,
      });
    });
  }

  Future<void> _addComponent(
    Map<String, dynamic> project,
    String type, {
    String? parentId,
  }) async {
    final document = siteMap(project['draft']);
    final pages = siteList(document['pages']);
    if (pages.isEmpty) return;
    final page = pages.firstWhere(
      (item) => item['id'] == _selectedPageId,
      orElse: () => pages.first,
    );
    var target = parentId ?? _selectedNodeId;
    final selected = target == null ? null : findWebsiteNode(document, target);
    if (selected == null || !_containerType(selected['type']?.toString())) {
      target = siteMap(page['root'])['id']?.toString();
    }
    final node = _newNode(type);
    _selectedNodeId = node['id']?.toString();
    await _patch(project, {
      'op': 'insertNode',
      'parentId': target,
      'index': 9999,
      'node': node,
    });
  }

  Future<void> _removeNode(Map<String, dynamic> project, String nodeId) async {
    _selectedNodeId = null;
    await _patch(project, {'op': 'removeNode', 'nodeId': nodeId});
  }

  Future<void> _addPage(Map<String, dynamic> project) async {
    final nameController = TextEditingController(text: 'New Page');
    final pathController = TextEditingController(text: '/page');
    final accepted = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Add page'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(controller: nameController, decoration: const InputDecoration(labelText: 'Name')),
            const SizedBox(height: 10),
            TextField(controller: pathController, decoration: const InputDecoration(labelText: 'Path')),
          ],
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancel')),
          FilledButton(onPressed: () => Navigator.pop(context, true), child: const Text('Add')),
        ],
      ),
    );
    final name = nameController.text.trim();
    final path = pathController.text.trim();
    nameController.dispose();
    pathController.dispose();
    if (accepted != true || name.isEmpty || !path.startsWith('/')) return;
    final document = _deepCopy(siteMap(project['draft']));
    final pageId = 'page_${DateTime.now().millisecondsSinceEpoch}';
    final pages = (document['pages'] as List).cast<dynamic>();
    pages.add({
      'id': pageId,
      'name': name,
      'path': path,
      'title': name,
      'description': '',
      'root': {'id': '${pageId}_root', 'type': 'page', 'props': {}, 'style': {}, 'responsive': {}, 'action': {'type': 'none'}, 'children': []},
    });
    if (store.demo) {
      setState(() {
        _demoProject!['draft'] = document;
        _demoProject!['revision'] = (_demoProject!['revision'] as int) + 1;
        _selectedPageId = pageId;
      });
      return;
    }
    await _run(() async {
      await store.call('replaceWebsiteDocument', {
        'projectId': project['id'],
        'expectedRevision': project['revision'],
        'document': document,
      });
      if (mounted) setState(() => _selectedPageId = pageId);
    });
  }

  Future<void> _publish(Map<String, dynamic> project) async {
    if (store.demo) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Preview mode: publish would atomically replace the live JSON snapshot.')),
      );
      return;
    }
    await _run(() async {
      final result = await store.call('publishWebsiteProject', {'projectId': project['id']});
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Published version ${result['version']} · ${result['publicId']}')),
      );
    });
  }

  Future<void> _aiGenerate(Map<String, dynamic> project) async {
    final controller = TextEditingController(
      text: 'Create a premium, modern African technology company website with a strong hero, services, proof points, pricing, testimonials and a conversion CTA.',
    );
    final accepted = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Generate website from a design brief'),
        content: SizedBox(
          width: 620,
          child: TextField(
            controller: controller,
            minLines: 5,
            maxLines: 10,
            decoration: const InputDecoration(
              labelText: 'Prompt',
              helperText: 'The model can only return validated TeknTandao JSON nodes—no scripts or arbitrary code.',
              border: OutlineInputBorder(),
            ),
          ),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancel')),
          FilledButton(onPressed: () => Navigator.pop(context, true), child: const Text('Generate')),
        ],
      ),
    );
    final prompt = controller.text.trim();
    controller.dispose();
    if (accepted != true || prompt.isEmpty) return;
    if (store.demo) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('AI generation requires the configured production Gemini provider.')),
      );
      return;
    }
    await _run(() async {
      final generated = await store.call('generateWebsiteFromPrompt', {'prompt': prompt});
      await store.call('replaceWebsiteDocument', {
        'projectId': project['id'],
        'expectedRevision': project['revision'],
        'document': generated['document'],
      });
      if (mounted) {
        setState(() {
          _selectedNodeId = null;
          _selectedPageId = null;
        });
      }
    });
  }

  Future<void> _exportScaffold(Map<String, dynamic> project) async {
    if (store.demo) {
      _showExportFiles({
        'assets/site.json': const JsonEncoder.withIndent('  ').convert(project['draft']),
        'README.md': 'Generated Flutter/Firebase scaffold listens to the published site JSON for live updates.',
      });
      return;
    }
    await _run(() async {
      final result = await store.call('exportWebsiteFlutterScaffold', {'projectId': project['id']});
      _showExportFiles(Map<String, dynamic>.from(result['files'] as Map));
    });
  }

  void _showExportFiles(Map<String, dynamic> files) {
    var selected = files.keys.first;
    showDialog<void>(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, update) => AlertDialog(
          title: const Text('Generated Flutter + Firebase scaffold'),
          content: SizedBox(
            width: 850,
            height: 580,
            child: Column(
              children: [
                DropdownButtonFormField<String>(
                  initialValue: selected,
                  items: files.keys.map((key) => DropdownMenuItem(value: key, child: Text(key))).toList(),
                  onChanged: (value) {
                    if (value != null) update(() => selected = value);
                  },
                ),
                const SizedBox(height: 12),
                Expanded(
                  child: Container(
                    width: double.infinity,
                    padding: const EdgeInsets.all(12),
                    color: const Color(0xFF0F172A),
                    child: SingleChildScrollView(
                      child: SelectableText(
                        files[selected]?.toString() ?? '',
                        style: const TextStyle(color: Color(0xFFE2E8F0), fontFamily: 'monospace', fontSize: 12),
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Clipboard.setData(ClipboardData(text: files[selected]?.toString() ?? '')),
              child: const Text('Copy file'),
            ),
            FilledButton(onPressed: () => Navigator.pop(context), child: const Text('Done')),
          ],
        ),
      ),
    );
  }

  void _showJson(Map<String, dynamic> document) {
    final json = const JsonEncoder.withIndent('  ').convert(document);
    showDialog<void>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Live website JSON'),
        content: SizedBox(
          width: 820,
          height: 560,
          child: SingleChildScrollView(child: SelectableText(json, style: const TextStyle(fontFamily: 'monospace', fontSize: 12))),
        ),
        actions: [
          TextButton(onPressed: () => Clipboard.setData(ClipboardData(text: json)), child: const Text('Copy JSON')),
          FilledButton(onPressed: () => Navigator.pop(context), child: const Text('Close')),
        ],
      ),
    );
  }

  Future<void> _editAction(Map<String, dynamic> project, Map<String, dynamic> node) async {
    final action = siteMap(node['action']);
    var type = action['type']?.toString() ?? 'none';
    final target = TextEditingController(text: action['path']?.toString() ?? action['url']?.toString() ?? '');
    final accepted = await showDialog<bool>(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, update) => AlertDialog(
          title: const Text('Component action'),
          content: SizedBox(
            width: 460,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                DropdownButtonFormField<String>(
                  initialValue: type,
                  items: const [
                    DropdownMenuItem(value: 'none', child: Text('No action')),
                    DropdownMenuItem(value: 'navigate', child: Text('Navigate to page')),
                    DropdownMenuItem(value: 'externalUrl', child: Text('Open URL')),
                  ],
                  onChanged: (value) => update(() => type = value ?? 'none'),
                ),
                const SizedBox(height: 12),
                if (type != 'none')
                  TextField(controller: target, decoration: InputDecoration(labelText: type == 'navigate' ? 'Path, e.g. /pricing' : 'https://...')),
              ],
            ),
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancel')),
            FilledButton(onPressed: () => Navigator.pop(context, true), child: const Text('Save')),
          ],
        ),
      ),
    );
    final destination = target.text.trim();
    target.dispose();
    if (accepted != true) return;
    await _patch(project, {
      'op': 'updateNode',
      'nodeId': node['id'],
      'action': switch (type) {
        'navigate' => {'type': type, 'path': destination},
        'externalUrl' => {'type': type, 'url': destination},
        _ => {'type': 'none'},
      },
    });
  }

  Widget _marketplaceTab() {
    final templates = siteList(_marketplace['templates']);
    return ListView(
      padding: const EdgeInsets.all(24),
      children: [
        Row(
          children: [
            const Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('Template Marketplace', style: TextStyle(fontSize: 28, fontWeight: FontWeight.bold)),
                  Text('Versioned, remixable JSON websites with creator licensing and verified purchase entitlements.'),
                ],
              ),
            ),
            OutlinedButton.icon(onPressed: store.demo ? null : _refreshMarketplace, icon: const Icon(Icons.refresh_rounded), label: const Text('Refresh')),
          ],
        ),
        const SizedBox(height: 20),
        if (templates.isEmpty)
          const Card(child: Padding(padding: EdgeInsets.all(24), child: Text('No published templates yet. Publish the first one from a website project.')))
        else
          Wrap(
            spacing: 16,
            runSpacing: 16,
            children: templates.map((template) => _templateCard(template)).toList(),
          ),
      ],
    );
  }

  Widget _templateCard(Map<String, dynamic> template) {
    final price = (template['priceMinor'] as num?) ?? 0;
    return SizedBox(
      width: 350,
      child: Card(
        clipBehavior: Clip.antiAlias,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(
              height: 150,
              width: double.infinity,
              decoration: const BoxDecoration(
                gradient: LinearGradient(colors: [Color(0xFF0F172A), Color(0xFF2563EB)]),
              ),
              child: const Center(child: Icon(Icons.web_stories_rounded, color: Colors.white, size: 54)),
            ),
            Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(template['name']?.toString() ?? 'Template', style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
                  const SizedBox(height: 4),
                  Text('by ${template['creatorName'] ?? 'Creator'} · v${template['version'] ?? 1}'),
                  const SizedBox(height: 8),
                  Text(template['description']?.toString() ?? ''),
                  const SizedBox(height: 12),
                  Wrap(
                    spacing: 6,
                    children: [
                      Chip(label: Text(template['license']?.toString() ?? 'single_use')),
                      Chip(label: Text('${template['installs'] ?? 0} installs')),
                    ],
                  ),
                  const SizedBox(height: 12),
                  Text(price == 0 ? 'Free' : kes(price), style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
                  const SizedBox(height: 10),
                  if (price == 0)
                    FilledButton.icon(
                      onPressed: () => _installTemplate(template),
                      icon: const Icon(Icons.content_copy_rounded),
                      label: const Text('Use template'),
                    )
                  else
                    Wrap(
                      spacing: 8,
                      runSpacing: 8,
                      children: [
                        FilledButton(onPressed: () => _buyTemplate(template, 'paystack'), child: const Text('Buy · Paystack')),
                        OutlinedButton(onPressed: () => _buyTemplate(template, 'mpesa'), child: const Text('Buy · M-Pesa')),
                        TextButton(onPressed: () => _installTemplate(template), child: const Text('Install purchased')),
                      ],
                    ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _installTemplate(Map<String, dynamic> template) async {
    if (store.demo) {
      setState(() => _tab = 0);
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Demo template loaded conceptually.')));
      return;
    }
    await _run(() async {
      final result = await store.call('installWebsiteTemplate', {'templateId': template['templateId']});
      if (mounted) {
        setState(() {
          _selectedProjectId = result['projectId']?.toString();
          _tab = 0;
        });
      }
    });
  }

  Future<void> _buyTemplate(Map<String, dynamic> template, String provider) async {
    if (store.demo) return;
    String? phone;
    if (provider == 'mpesa') {
      final controller = TextEditingController();
      final accepted = await showDialog<bool>(
        context: context,
        builder: (context) => AlertDialog(
          title: const Text('M-Pesa template purchase'),
          content: TextField(controller: controller, keyboardType: TextInputType.phone, decoration: const InputDecoration(labelText: 'Phone', hintText: '2547...')),
          actions: [
            TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancel')),
            FilledButton(onPressed: () => Navigator.pop(context, true), child: const Text('Send STK')),
          ],
        ),
      );
      phone = controller.text.trim();
      controller.dispose();
      if (accepted != true || phone.isEmpty) return;
    }
    await _run(() async {
      final result = await store.call('startWebsiteTemplatePurchase', {
        'templateId': template['templateId'],
        'provider': provider,
        'phone': ?phone,
      });
      if (result['url'] != null) {
        final uri = Uri.tryParse(result['url'].toString());
        if (uri != null) await launchUrl(uri, mode: LaunchMode.platformDefault);
      } else if (provider == 'mpesa' && result['reference'] != null && mounted) {
        _showMpesaCheck(result['reference'].toString());
      }
    });
  }

  void _showMpesaCheck(String reference) {
    showDialog<void>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Complete M-Pesa payment'),
        content: const Text('Approve the STK prompt on your phone, then check the payment. Entitlement is granted only after Daraja verification succeeds.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context), child: const Text('Later')),
          FilledButton(
            onPressed: () async {
              try {
                final result = await store.call('checkWebsiteTemplateMpesaPurchase', {'reference': reference});
                if (!context.mounted) return;
                ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Payment: ${result['state']}')));
                if (result['state'] == 'paid') Navigator.pop(context);
              } catch (error) {
                if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(error.toString())));
              }
            },
            child: const Text('Check payment'),
          ),
        ],
      ),
    );
  }

  Widget _creatorTab() {
    final earnings = siteMap(_creator['earnings']);
    final templates = siteList(_creator['templates']);
    return ListView(
      padding: const EdgeInsets.all(24),
      children: [
        Row(
          children: [
            const Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('Creator Studio', style: TextStyle(fontSize: 28, fontWeight: FontWeight.bold)),
                  Text('Publish templates, track installs and record verified marketplace earnings.'),
                ],
              ),
            ),
            OutlinedButton.icon(onPressed: store.demo ? null : _refreshCreator, icon: const Icon(Icons.refresh_rounded), label: const Text('Refresh')),
          ],
        ),
        const SizedBox(height: 18),
        Wrap(
          spacing: 12,
          runSpacing: 12,
          children: [
            _metric('Pending payout', kes((earnings['pendingMinor'] as num?) ?? 0), Icons.hourglass_top_rounded),
            _metric('Paid out', kes((earnings['paidMinor'] as num?) ?? 0), Icons.task_alt_rounded),
            _metric('Verified sales', '${earnings['sales'] ?? 0}', Icons.shopping_bag_rounded),
            _metric('Templates', '${templates.length}', Icons.web_stories_rounded),
          ],
        ),
        const SizedBox(height: 16),
        const Card(
          child: ListTile(
            leading: Icon(Icons.info_outline_rounded),
            title: Text('Sales and entitlements are live; automated creator payouts are intentionally separate.'),
            subtitle: Text('Buyer payment is verified before access is granted. Seller earnings are recorded as payable balances until a payout rail is configured.'),
          ),
        ),
        const SizedBox(height: 12),
        ...templates.map((template) => Card(
              child: ListTile(
                leading: const Icon(Icons.layers_rounded),
                title: Text(template['name']?.toString() ?? template['templateId']?.toString() ?? 'Template'),
                subtitle: Text('v${template['version'] ?? 1} · ${template['sales'] ?? 0} sales · ${template['installs'] ?? 0} installs'),
                trailing: Text(kes((template['priceMinor'] as num?) ?? 0)),
              ),
            )),
      ],
    );
  }

  Future<void> _publishTemplate(Map<String, dynamic> project) async {
    final name = TextEditingController(text: project['title']?.toString() ?? 'Website Template');
    final creator = TextEditingController();
    final description = TextEditingController();
    final price = TextEditingController(text: '0');
    var license = 'free';
    final accepted = await showDialog<bool>(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, update) => AlertDialog(
          title: const Text('Publish template'),
          content: SizedBox(
            width: 560,
            child: SingleChildScrollView(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  TextField(controller: name, decoration: const InputDecoration(labelText: 'Template name')),
                  const SizedBox(height: 10),
                  TextField(controller: creator, decoration: const InputDecoration(labelText: 'Creator name')),
                  const SizedBox(height: 10),
                  TextField(controller: description, minLines: 3, maxLines: 5, decoration: const InputDecoration(labelText: 'Description')),
                  const SizedBox(height: 10),
                  TextField(controller: price, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'Price in KES')),
                  const SizedBox(height: 10),
                  DropdownButtonFormField<String>(
                    initialValue: license,
                    items: const [
                      DropdownMenuItem(value: 'free', child: Text('Free')),
                      DropdownMenuItem(value: 'single_use', child: Text('Single use')),
                      DropdownMenuItem(value: 'commercial', child: Text('Commercial')),
                      DropdownMenuItem(value: 'extended', child: Text('Extended')),
                    ],
                    onChanged: (value) => update(() => license = value ?? 'free'),
                  ),
                ],
              ),
            ),
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancel')),
            FilledButton(onPressed: () => Navigator.pop(context, true), child: const Text('Publish')),
          ],
        ),
      ),
    );
    final templateName = name.text.trim();
    final creatorName = creator.text.trim();
    final descriptionText = description.text.trim();
    final priceKes = double.tryParse(price.text.trim()) ?? 0;
    name.dispose();
    creator.dispose();
    description.dispose();
    price.dispose();
    if (accepted != true || templateName.isEmpty || creatorName.isEmpty || descriptionText.isEmpty) return;
    if (store.demo) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Preview mode: template publication was not sent.')));
      return;
    }
    await _run(() async {
      await store.call('publishWebsiteTemplate', {
        'projectId': project['id'],
        'metadata': {
          'name': templateName,
          'creatorName': creatorName,
          'description': descriptionText,
          'category': 'Website',
          'priceMinor': (priceKes * 100).round(),
          'license': priceKes == 0 ? 'free' : license,
          'tags': ['responsive', 'flutter', 'firebase'],
        },
      });
      await _refreshMarketplace();
      await _refreshCreator();
      if (mounted) setState(() => _tab = 2);
    });
  }

  Widget _metric(String label, String value, IconData icon) => SizedBox(
        width: 220,
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
                      Text(value, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 17)),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      );

  Map<String, dynamic> _newNode(String type) {
    final id = '${type}_${DateTime.now().microsecondsSinceEpoch}';
    final props = switch (type) {
      'heading' => {'text': 'New heading'},
      'text' => {'text': 'Add your message here.'},
      'image' => {'imageUrl': 'https://images.unsplash.com/photo-1497366811353-6870744d04b2', 'aspectRatio': 1.777},
      'button' => {'text': 'Learn more'},
      'hero' => {'eyebrow': 'NEW', 'title': 'A stronger headline', 'subtitle': 'Explain the value clearly and simply.'},
      'navbar' => {'brand': 'Your Brand'},
      'cta' => {'title': 'Ready to get started?', 'subtitle': 'Turn visitors into customers.'},
      'footer' => {'copyright': '© ${DateTime.now().year} Your Company'},
      'grid' => {'columns': 3, 'childAspectRatio': 1.6},
      'features' => {'columns': 3, 'childAspectRatio': 1.4},
      'pricing' => {'columns': 3, 'childAspectRatio': 1.0},
      'testimonials' => {'columns': 3, 'childAspectRatio': 1.4},
      'spacer' => {'height': 32},
      'form' => {'title': 'Contact us', 'field1': 'Name', 'field2': 'Email'},
      _ => <String, dynamic>{},
    };
    return {
      'id': id,
      'type': type,
      'props': props,
      'style': type == 'section' || type == 'hero' || type == 'cta'
          ? {'padding': 40.0, 'gap': 16.0}
          : {'padding': 8.0, 'gap': 12.0},
      'responsive': {},
      'action': {'type': 'none'},
      'children': [],
    };
  }

  bool _containerType(String? type) => !{
        'heading',
        'text',
        'richText',
        'image',
        'button',
        'icon',
        'divider',
        'spacer',
      }.contains(type);

  IconData _componentIcon(String type) => switch (type) {
        'heading' => Icons.title_rounded,
        'text' => Icons.notes_rounded,
        'image' => Icons.image_rounded,
        'button' => Icons.smart_button_rounded,
        'row' => Icons.view_week_rounded,
        'column' => Icons.view_agenda_rounded,
        'grid' => Icons.grid_view_rounded,
        'navbar' => Icons.menu_rounded,
        'hero' => Icons.star_rounded,
        'pricing' => Icons.sell_rounded,
        'testimonials' => Icons.format_quote_rounded,
        'form' => Icons.dynamic_form_rounded,
        'footer' => Icons.vertical_align_bottom_rounded,
        'divider' => Icons.horizontal_rule_rounded,
        'spacer' => Icons.height_rounded,
        _ => Icons.widgets_rounded,
      };

  String _humanize(String value) => value
      .replaceAllMapped(RegExp(r'([a-z])([A-Z])'), (match) => '${match.group(1)} ${match.group(2)}')
      .replaceAll('_', ' ')
      .split(' ')
      .where((part) => part.isNotEmpty)
      .map((part) => '${part[0].toUpperCase()}${part.substring(1)}')
      .join(' ');

  Map<String, dynamic> _deepCopy(Map<String, dynamic> input) =>
      Map<String, dynamic>.from(jsonDecode(jsonEncode(input)) as Map);

  void _applyLocalPatch(Map<String, dynamic> document, Map<String, dynamic> patch) {
    final op = patch['op'];
    if (op == 'setTheme') {
      document['theme'] = Map<String, dynamic>.from(patch['theme'] as Map);
      return;
    }
    if (op == 'updateNode') {
      final node = findWebsiteNode(document, patch['nodeId'].toString());
      if (node == null) return;
      if (patch['props'] is Map) node['props'] = {...siteMap(node['props']), ...Map<String, dynamic>.from(patch['props'] as Map)};
      if (patch['style'] is Map) node['style'] = {...siteMap(node['style']), ...Map<String, dynamic>.from(patch['style'] as Map)};
      if (patch['action'] is Map) node['action'] = Map<String, dynamic>.from(patch['action'] as Map);
      return;
    }
    if (op == 'insertNode') {
      final parent = findWebsiteNode(document, patch['parentId'].toString());
      if (parent != null) {
        final children = (parent['children'] as List? ?? <dynamic>[]);
        parent['children'] = children;
        children.add(_deepCopy(Map<String, dynamic>.from(patch['node'] as Map)));
      }
      return;
    }
    if (op == 'removeNode') {
      void remove(Map<String, dynamic> node) {
        final children = (node['children'] as List? ?? <dynamic>[]);
        children.removeWhere((child) => child is Map && child['id'] == patch['nodeId']);
        for (final child in children.whereType<Map>()) {
          remove(Map<String, dynamic>.from(child));
        }
      }
      for (final page in siteList(document['pages'])) {
        remove(siteMap(page['root']));
      }
    }
  }

  Map<String, dynamic> _demoDocument([String title = 'TeknTandao Studio Demo']) => {
        'schemaVersion': 1,
        'title': title,
        'theme': {
          'primaryColor': '#2563EB',
          'secondaryColor': '#7C3AED',
          'backgroundColor': '#FFFFFF',
          'surfaceColor': '#F8FAFC',
          'textColor': '#0F172A',
          'mutedTextColor': '#64748B',
          'fontFamily': 'Inter',
          'radius': 16,
          'maxContentWidth': 1200,
        },
        'settings': {'language': 'en', 'direction': 'ltr', 'faviconUrl': '', 'analyticsKey': ''},
        'pages': [
          {
            'id': 'home',
            'name': 'Home',
            'path': '/',
            'title': title,
            'description': 'JSON-first live website',
            'root': {
              'id': 'home_root',
              'type': 'page',
              'props': {},
              'style': {},
              'responsive': {},
              'action': {'type': 'none'},
              'children': [
                {
                  'id': 'demo_nav',
                  'type': 'navbar',
                  'props': {'brand': title},
                  'style': {'padding': 20.0},
                  'responsive': {},
                  'action': {'type': 'none'},
                  'children': [],
                },
                {
                  'id': 'demo_hero',
                  'type': 'hero',
                  'props': {
                    'eyebrow': 'JSON-FIRST WEBSITE OS',
                    'title': 'Design visually. Publish instantly.',
                    'subtitle': 'This canvas is rendered from validated JSON. Publishing updates the live Firestore snapshot without recompiling Flutter.',
                  },
                  'style': {'padding': 56.0, 'backgroundColor': '#F8FAFC'},
                  'responsive': {'mobile': {'padding': 24.0}},
                  'action': {'type': 'none'},
                  'children': [
                    {
                      'id': 'demo_button',
                      'type': 'button',
                      'props': {'text': 'Start building'},
                      'style': {},
                      'responsive': {},
                      'action': {'type': 'navigate', 'path': '/'},
                      'children': [],
                    },
                  ],
                },
              ],
            },
          },
        ],
      };
}

extension _FirstOrNull<T> on List<T> {
  T? get firstOrNull => isEmpty ? null : first;
}
