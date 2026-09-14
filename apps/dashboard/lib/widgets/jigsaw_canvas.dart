import 'package:flutter/material.dart';
import '../suite.dart';
import '../workspace_modules.dart';

class JigsawCanvas extends StatefulWidget {
  final SuiteStore store;
  final List<Map<String, dynamic>> installedApps;
  final Function(String moduleId) onInstallModule;
  final Function(String moduleId) onUninstallModule;
  final Function(SuiteModule module) onOpenModule;

  const JigsawCanvas({
    super.key,
    required this.store,
    required this.installedApps,
    required this.onInstallModule,
    required this.onUninstallModule,
    required this.onOpenModule,
  });

  @override
  State<JigsawCanvas> createState() => _JigsawCanvasState();
}

class _JigsawCanvasState extends State<JigsawCanvas>
    with SingleTickerProviderStateMixin {
  late final AnimationController _animationController;
  ModuleDependency? _selectedConnection;
  String? _selectedSourceModuleId;
  String _catalogQuery = '';
  String _catalogCategory = 'All';

  @override
  void initState() {
    super.initState();
    _animationController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 600),
    )..forward();
  }

  @override
  void dispose() {
    _animationController.dispose();
    super.dispose();
  }

  Set<String> get _installedIds =>
      widget.installedApps.map((app) => app['id'] as String).toSet();

  List<SuiteModule> get _installedModules => workspaceModules
      .where((module) => _installedIds.contains(module.id))
      .toList(growable: false);

  List<String> get _categories {
    final values = workspaceModules.map((module) => module.category).toSet().toList()
      ..sort();
    return values;
  }

  List<SuiteModule> get _filteredAvailableModules {
    final query = _catalogQuery.trim().toLowerCase();
    return workspaceModules.where((module) {
      if (_installedIds.contains(module.id)) return false;
      if (_catalogCategory != 'All' && module.category != _catalogCategory) {
        return false;
      }
      if (query.isEmpty) return true;
      final haystack = '${module.name} ${module.description} ${module.category}'
          .toLowerCase();
      return haystack.contains(query);
    }).toList(growable: false);
  }

  List<SuiteModule> get _visibleAvailableModules {
    final filtered = _filteredAvailableModules;
    if (_catalogQuery.trim().isEmpty && _catalogCategory == 'All') {
      return filtered.take(60).toList(growable: false);
    }
    return filtered;
  }

  @override
  Widget build(BuildContext context) {
    final filtered = _filteredAvailableModules;
    final visible = _visibleAvailableModules;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _buildHeader(),
        const SizedBox(height: 24),
        _buildActiveCanvas(),
        const SizedBox(height: 32),
        _buildCatalogControls(filtered.length, visible.length),
        const SizedBox(height: 16),
        if (visible.isEmpty)
          _emptyCatalogState()
        else
          Wrap(
            spacing: 16,
            runSpacing: 16,
            children: [
              for (final module in visible)
                Draggable<String>(
                  data: module.id,
                  feedback: Material(
                    color: Colors.transparent,
                    elevation: 12,
                    child: SizedBox(
                      width: 250,
                      child: _buildAvailablePiece(module, isDragging: true),
                    ),
                  ),
                  childWhenDragging: Opacity(
                    opacity: 0.3,
                    child: _buildAvailablePiece(module),
                  ),
                  child: _buildAvailablePiece(module),
                ),
            ],
          ),
        if (filtered.length > visible.length) ...[
          const SizedBox(height: 14),
          Text(
            'Showing the first ${visible.length} of ${filtered.length} apps. Search or choose a category to narrow the catalogue.',
            style: const TextStyle(fontSize: 12, color: Color(0xFF64748B)),
          ),
        ],
        if (_selectedConnection != null) ...[
          const SizedBox(height: 20),
          _buildConnectionInspector(),
        ],
      ],
    );
  }

  Widget _buildHeader() {
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          colors: [Color(0xFF0F172A), Color(0xFF1E293B)],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(20),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.15),
            blurRadius: 15,
            offset: const Offset(0, 5),
          ),
        ],
      ),
      child: Row(
        children: [
          Container(
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(
              color: const Color(0xFF3B82F6).withValues(alpha: 0.2),
              borderRadius: BorderRadius.circular(12),
            ),
            child: const Icon(Icons.extension_rounded,
                color: Color(0xFF60A5FA), size: 28),
          ),
          const SizedBox(width: 16),
          const Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Jigsaw Puzzle Workspace',
                  style: TextStyle(
                    color: Colors.white,
                    fontSize: 22,
                    fontWeight: FontWeight.bold,
                    letterSpacing: -0.5,
                  ),
                ),
                SizedBox(height: 4),
                Text(
                  'Search the master catalogue, add only the apps a business needs, and keep them on one tenant data fabric.',
                  style: TextStyle(color: Color(0xFFCBD5E1), fontSize: 13),
                ),
              ],
            ),
          ),
          const SizedBox(width: 12),
          Chip(
            avatar: const Icon(Icons.apps_rounded,
                size: 16, color: Color(0xFF60A5FA)),
            label: Text(
              '${workspaceModules.length} Apps',
              style: const TextStyle(
                  color: Colors.white, fontWeight: FontWeight.w600),
            ),
            backgroundColor: const Color(0xFF172554),
            side: const BorderSide(color: Color(0xFF3B82F6)),
          ),
          const SizedBox(width: 8),
          Chip(
            avatar: const Icon(Icons.hub_rounded,
                size: 16, color: Color(0xFF10B981)),
            label: Text(
              '${_installedModules.length} Active',
              style: const TextStyle(
                  color: Colors.white, fontWeight: FontWeight.w600),
            ),
            backgroundColor: const Color(0xFF064E3B),
            side: const BorderSide(color: Color(0xFF059669)),
          ),
        ],
      ),
    );
  }

  Widget _buildActiveCanvas() {
    return DragTarget<String>(
      key: const Key('workspace-drop-target'),
      onAcceptWithDetails: (details) {
        widget.onInstallModule(details.data);
        _animationController
          ..reset()
          ..forward();
      },
      builder: (context, candidateData, rejectedData) {
        final hovered = candidateData.isNotEmpty;
        return AnimatedContainer(
          duration: const Duration(milliseconds: 250),
          constraints: const BoxConstraints(minHeight: 260),
          width: double.infinity,
          padding: const EdgeInsets.all(24),
          decoration: BoxDecoration(
            color: hovered
                ? const Color(0xFF3B82F6).withValues(alpha: 0.08)
                : const Color(0xFFF8FAFC),
            borderRadius: BorderRadius.circular(24),
            border: Border.all(
              color: hovered
                  ? const Color(0xFF3B82F6)
                  : const Color(0xFFE2E8F0),
              width: hovered ? 2.5 : 2,
            ),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Row(
                children: [
                  Icon(Icons.widgets_outlined,
                      color: Color(0xFF475569), size: 20),
                  SizedBox(width: 8),
                  Text(
                    'Active Organization Canvas',
                    style: TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.bold,
                      color: Color(0xFF1E293B),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 20),
              if (_installedModules.isEmpty)
                const Padding(
                  padding: EdgeInsets.symmetric(vertical: 36),
                  child: Center(
                    child: Column(
                      children: [
                        Icon(Icons.extension_off_rounded,
                            size: 52, color: Color(0xFFCBD5E1)),
                        SizedBox(height: 10),
                        Text(
                          'Your organization workspace is empty',
                          style: TextStyle(
                              fontWeight: FontWeight.w600,
                              color: Color(0xFF64748B)),
                        ),
                        SizedBox(height: 4),
                        Text(
                          'Search below, then drag or click Add to Workspace.',
                          style: TextStyle(
                              fontSize: 12, color: Color(0xFF94A3B8)),
                        ),
                      ],
                    ),
                  ),
                )
              else
                Wrap(
                  spacing: 16,
                  runSpacing: 16,
                  children: [
                    for (final module in _installedModules)
                      ScaleTransition(
                        scale: CurvedAnimation(
                          parent: _animationController,
                          curve: Curves.elasticOut,
                        ),
                        child: _buildInstalledPiece(module),
                      ),
                  ],
                ),
              if (_installedModules.length >= 2) ...[
                const SizedBox(height: 24),
                const Divider(),
                const SizedBox(height: 12),
                _buildConnectionGraph(),
              ],
            ],
          ),
        );
      },
    );
  }

  Widget _buildCatalogControls(int filteredCount, int visibleCount) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            const Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Master Application Catalogue',
                    style: TextStyle(
                        fontSize: 20,
                        fontWeight: FontWeight.bold,
                        color: Color(0xFF0F172A)),
                  ),
                  Text(
                    'Every app is independently installable and priced; bundle discounts are calculated at checkout.',
                    style: TextStyle(fontSize: 13, color: Color(0xFF64748B)),
                  ),
                ],
              ),
            ),
            Text(
              '$filteredCount available',
              style: const TextStyle(
                  fontWeight: FontWeight.w600, color: Color(0xFF3B82F6)),
            ),
          ],
        ),
        const SizedBox(height: 14),
        Row(
          children: [
            Expanded(
              child: TextField(
                decoration: const InputDecoration(
                  prefixIcon: Icon(Icons.search_rounded),
                  hintText: 'Search CRM, payroll, mining, AI, school, M-Pesa...',
                  border: OutlineInputBorder(),
                  isDense: true,
                ),
                onChanged: (value) =>
                    setState(() => _catalogQuery = value.toLowerCase()),
              ),
            ),
            const SizedBox(width: 12),
            SizedBox(
              width: 300,
              child: DropdownButtonFormField<String>(
                value: _catalogCategory,
                isExpanded: true,
                decoration: const InputDecoration(
                  labelText: 'Category',
                  border: OutlineInputBorder(),
                  isDense: true,
                ),
                items: [
                  const DropdownMenuItem(value: 'All', child: Text('All categories')),
                  for (final category in _categories)
                    DropdownMenuItem(value: category, child: Text(category)),
                ],
                onChanged: (value) =>
                    setState(() => _catalogCategory = value ?? 'All'),
              ),
            ),
          ],
        ),
        if (visibleCount < filteredCount) const SizedBox(height: 4),
      ],
    );
  }

  Widget _emptyCatalogState() => const Card(
        child: Padding(
          padding: EdgeInsets.all(28),
          child: Row(
            children: [
              Icon(Icons.search_off_rounded, color: Color(0xFF64748B)),
              SizedBox(width: 12),
              Text('No apps match the current search and category filters.'),
            ],
          ),
        ),
      );

  Widget _buildInstalledPiece(SuiteModule module) {
    final activeConnections = module.dependencies
        .where((dependency) => _installedIds.contains(dependency.targetModuleId))
        .toList(growable: false);
    return Container(
      width: 270,
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(
            color: module.color.withValues(alpha: 0.4), width: 2),
      ),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                CircleAvatar(
                  backgroundColor: module.color.withValues(alpha: 0.12),
                  child: Icon(module.icon, color: module.color),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(module.name,
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(fontWeight: FontWeight.bold)),
                      Text(module.category,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                              fontSize: 11, color: Color(0xFF64748B))),
                    ],
                  ),
                ),
                IconButton(
                  tooltip: 'Uninstall',
                  onPressed: () => widget.onUninstallModule(module.id),
                  icon: const Icon(Icons.remove_circle_outline_rounded,
                      color: Colors.redAccent, size: 19),
                ),
              ],
            ),
            const SizedBox(height: 10),
            Text(module.description,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(fontSize: 12, color: Color(0xFF64748B))),
            if (activeConnections.isNotEmpty) ...[
              const SizedBox(height: 10),
              Wrap(
                spacing: 6,
                runSpacing: 6,
                children: [
                  for (final connection in activeConnections)
                    ActionChip(
                      avatar: const Icon(Icons.link_rounded, size: 13),
                      label: Text(connection.targetModuleId.toUpperCase(),
                          style: const TextStyle(fontSize: 10)),
                      onPressed: () => setState(() {
                        _selectedConnection = connection;
                        _selectedSourceModuleId = module.id;
                      }),
                    ),
                ],
              ),
            ],
            const SizedBox(height: 12),
            SizedBox(
              width: double.infinity,
              child: ElevatedButton.icon(
                key: Key('open-${module.id}'),
                onPressed: () => widget.onOpenModule(module),
                icon: const Icon(Icons.open_in_new_rounded, size: 14),
                label: const Text('Open App'),
                style: ElevatedButton.styleFrom(
                  backgroundColor: module.color,
                  foregroundColor: Colors.white,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildAvailablePiece(SuiteModule module, {bool isDragging = false}) {
    return Container(
      width: 250,
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: isDragging ? module.color : const Color(0xFFE2E8F0),
          width: isDragging ? 2 : 1,
        ),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: isDragging ? 0.15 : 0.04),
            blurRadius: isDragging ? 16 : 8,
            offset: const Offset(0, 3),
          ),
        ],
      ),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Container(
                  padding: const EdgeInsets.all(8),
                  decoration: BoxDecoration(
                    color: module.color.withValues(alpha: 0.12),
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: Icon(module.icon, color: module.color, size: 22),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Text(module.name,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(fontWeight: FontWeight.bold)),
                ),
                const Icon(Icons.drag_indicator_rounded,
                    color: Color(0xFF94A3B8)),
              ],
            ),
            const SizedBox(height: 8),
            Text(module.category,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.w600,
                    color: module.color)),
            const SizedBox(height: 6),
            Text(module.description,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(fontSize: 12, color: Color(0xFF64748B))),
            const SizedBox(height: 10),
            Text('${kes(module.monthlyPriceKes)}/mo',
                style: const TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.bold,
                    color: Color(0xFF059669))),
            const SizedBox(height: 10),
            SizedBox(
              width: double.infinity,
              child: OutlinedButton.icon(
                key: Key('add-${module.id}'),
                onPressed: () => widget.onInstallModule(module.id),
                icon: const Icon(Icons.add_circle_outline_rounded, size: 14),
                label: const Text('Add to Workspace'),
                style: OutlinedButton.styleFrom(
                  foregroundColor: module.color,
                  side: BorderSide(color: module.color.withValues(alpha: 0.6)),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildConnectionGraph() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text('Connected data fabric',
            style: TextStyle(fontWeight: FontWeight.bold)),
        const SizedBox(height: 8),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            for (final module in _installedModules)
              for (final dependency in module.dependencies)
                if (_installedIds.contains(dependency.targetModuleId))
                  ActionChip(
                    avatar: const Icon(Icons.sync_alt_rounded, size: 14),
                    label: Text(
                        '${module.name} ↔ ${dependency.targetModuleId.toUpperCase()}'),
                    onPressed: () => setState(() {
                      _selectedConnection = dependency;
                      _selectedSourceModuleId = module.id;
                    }),
                  ),
          ],
        ),
      ],
    );
  }

  Widget _buildConnectionInspector() {
    final source = workspaceModuleById[_selectedSourceModuleId];
    final connection = _selectedConnection!;
    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: const Color(0xFFEFF6FF),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: const Color(0xFF93C5FD)),
      ),
      child: Row(
        children: [
          const Icon(Icons.info_outline_rounded,
              color: Color(0xFF1D4ED8)),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  '${source?.name ?? _selectedSourceModuleId} ↔ ${connection.targetModuleId.toUpperCase()}',
                  style: const TextStyle(
                      fontWeight: FontWeight.bold, color: Color(0xFF1E3A8A)),
                ),
                const SizedBox(height: 3),
                Text(connection.relationDescription,
                    style: const TextStyle(color: Color(0xFF1E40AF))),
              ],
            ),
          ),
          IconButton(
            onPressed: () => setState(() {
              _selectedConnection = null;
              _selectedSourceModuleId = null;
            }),
            icon: const Icon(Icons.close_rounded),
          ),
        ],
      ),
    );
  }
}
