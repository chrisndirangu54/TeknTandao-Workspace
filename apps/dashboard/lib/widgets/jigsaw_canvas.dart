import 'package:flutter/material.dart';
import '../suite.dart';

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

class _JigsawCanvasState extends State<JigsawCanvas> with SingleTickerProviderStateMixin {
  late AnimationController _animationController;
  ModuleDependency? _selectedConnection;
  String? _selectedSourceModuleId;

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

  Set<String> get _installedIds => widget.installedApps.map((a) => a['id'] as String).toSet();

  List<SuiteModule> get _installedModules =>
      modules.where((m) => _installedIds.contains(m.id)).toList();

  List<SuiteModule> get _availableModules =>
      modules.where((m) => !_installedIds.contains(m.id)).toList();

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // Canvas Header
        Container(
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
              )
            ],
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Container(
                    padding: const EdgeInsets.all(10),
                    decoration: BoxDecoration(
                      color: const Color(0xFF3B82F6).withValues(alpha: 0.2),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: const Icon(Icons.extension_rounded, color: Color(0xFF60A5FA), size: 28),
                  ),
                  const SizedBox(width: 16),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text(
                          'Jigsaw Puzzle Workspace',
                          style: TextStyle(
                            color: Colors.white,
                            fontSize: 22,
                            fontWeight: FontWeight.bold,
                            letterSpacing: -0.5,
                          ),
                        ),
                        const SizedBox(height: 4),
                        Text(
                          'Drag puzzle modules into your workspace. Connected pieces auto-provision data flows, security rules & eTIMS taxes.',
                          style: TextStyle(color: Colors.grey.shade400, fontSize: 13),
                        ),
                      ],
                    ),
                  ),
                  Chip(
                    avatar: const Icon(Icons.hub_rounded, size: 16, color: Color(0xFF10B981)),
                    label: Text(
                      '${_installedModules.length} Active Modules',
                      style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w600, fontSize: 12),
                    ),
                    backgroundColor: const Color(0xFF064E3B),
                    side: const BorderSide(color: Color(0xFF059669)),
                  )
                ],
              ),
            ],
          ),
        ),

        const SizedBox(height: 24),

        // Workspace Puzzle Drop Surface
        DragTarget<String>(
          key: const Key('workspace-drop-target'),
          onAcceptWithDetails: (details) {
            widget.onInstallModule(details.data);
            _animationController.reset();
            _animationController.forward();
          },
          builder: (context, candidateData, rejectedData) {
            final isHovered = candidateData.isNotEmpty;
            return AnimatedContainer(
              duration: const Duration(milliseconds: 300),
              constraints: const BoxConstraints(minHeight: 280),
              width: double.infinity,
              padding: const EdgeInsets.all(24),
              decoration: BoxDecoration(
                color: isHovered
                    ? const Color(0xFF3B82F6).withValues(alpha: 0.08)
                    : const Color(0xFFF8FAFC),
                borderRadius: BorderRadius.circular(24),
                border: Border.all(
                  color: isHovered ? const Color(0xFF3B82F6) : const Color(0xFFE2E8F0),
                  width: isHovered ? 2.5 : 2.0,
                ),
                boxShadow: isHovered
                    ? [
                        BoxShadow(
                          color: const Color(0xFF3B82F6).withValues(alpha: 0.15),
                          blurRadius: 20,
                          spreadRadius: 2,
                        )
                      ]
                    : [],
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      const Icon(Icons.widgets_outlined, color: Color(0xFF475569), size: 20),
                      const SizedBox(width: 8),
                      const Text(
                        'Active Organization Canvas',
                        style: TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.bold,
                          color: Color(0xFF1E293B),
                        ),
                      ),
                      const Spacer(),
                      if (_installedModules.isNotEmpty)
                        Flexible(
                          child: Text(
                            'Click module to open · Click connection badges to inspect',
                            style: TextStyle(fontSize: 11, color: Colors.grey.shade600),
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                    ],
                  ),

                  const SizedBox(height: 20),

                  if (_installedModules.isEmpty)
                    Center(
                      child: Padding(
                        padding: const EdgeInsets.symmetric(vertical: 40),
                        child: Column(
                          children: [
                            Icon(Icons.extension_off_rounded, size: 56, color: Colors.grey.shade300),
                            const SizedBox(height: 12),
                            const Text(
                              'Your Organization Workspace is Empty',
                              style: TextStyle(fontSize: 18, fontWeight: FontWeight.w600, color: Color(0xFF64748B)),
                            ),
                            const SizedBox(height: 6),
                            const Text(
                              'Drag a puzzle piece from the catalog below to snap it into place.',
                              style: TextStyle(fontSize: 13, color: Color(0xFF94A3B8)),
                            ),
                          ],
                        ),
                      ),
                    ),

                  // Installed Jigsaw Grid
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
                          child: _buildInstalledJigsawPiece(module),
                        ),
                    ],
                  ),

                  // Active Data Fabric Connection Map
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
        ),

        const SizedBox(height: 32),

        // Catalog Header
        Row(
          children: [
            const Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Available Puzzle Modules Catalog',
                    style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold, color: Color(0xFF0F172A)),
                  ),
                  Text(
                    'Drag and drop any module into the canvas above to provision immediately.',
                    style: TextStyle(fontSize: 13, color: Color(0xFF64748B)),
                  ),
                ],
              ),
            ),
            Text(
              '${_availableModules.length} Modules Available',
              style: const TextStyle(fontWeight: FontWeight.w600, color: Color(0xFF3B82F6)),
            ),
          ],
        ),

        const SizedBox(height: 16),

        // Available Modules Catalog
        Wrap(
          spacing: 16,
          runSpacing: 16,
          children: [
            for (final module in _availableModules)
              Draggable<String>(
                data: module.id,
                feedback: Material(
                  color: Colors.transparent,
                  elevation: 12,
                  child: SizedBox(
                    width: 250,
                    child: _buildAvailableJigsawPiece(module, isDragging: true),
                  ),
                ),
                childWhenDragging: Opacity(
                  opacity: 0.3,
                  child: _buildAvailableJigsawPiece(module),
                ),
                child: _buildAvailableJigsawPiece(module),
              ),
          ],
        ),

        // Connection Detail Modal Sheet
        if (_selectedConnection != null)
          _buildConnectionInspectorModal(),
      ],
    );
  }

  Widget _buildInstalledJigsawPiece(SuiteModule module) {
    final activeConns = module.dependencies.where((d) => _installedIds.contains(d.targetModuleId)).toList();

    return Container(
      width: 260,
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: module.color.withValues(alpha: 0.4), width: 2),
        boxShadow: [
          BoxShadow(
            color: module.color.withValues(alpha: 0.08),
            blurRadius: 12,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
            decoration: BoxDecoration(
              color: module.color.withValues(alpha: 0.1),
              borderRadius: const BorderRadius.only(
                topLeft: Radius.circular(16),
                topRight: Radius.circular(16),
              ),
            ),
            child: Row(
              children: [
                Container(
                  padding: const EdgeInsets.all(8),
                  decoration: BoxDecoration(
                    color: module.color,
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: Icon(module.icon, color: Colors.white, size: 20),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        module.name,
                        style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 15),
                      ),
                      Text(
                        module.category,
                        style: TextStyle(fontSize: 11, color: Colors.grey.shade600),
                      ),
                    ],
                  ),
                ),
                IconButton(
                  icon: const Icon(Icons.remove_circle_outline_rounded, color: Colors.redAccent, size: 18),
                  tooltip: 'Uninstall Module',
                  onPressed: () => widget.onUninstallModule(module.id),
                )
              ],
            ),
          ),

          Padding(
            padding: const EdgeInsets.all(14),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  module.description,
                  style: TextStyle(fontSize: 12, color: Colors.grey.shade700, height: 1.3),
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                ),
                const SizedBox(height: 12),

                if (activeConns.isNotEmpty) ...[
                  Text(
                    'Connected Data Fabrics:',
                    style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold, color: Colors.grey.shade600),
                  ),
                  const SizedBox(height: 6),
                  Wrap(
                    spacing: 6,
                    runSpacing: 4,
                    children: [
                      for (final conn in activeConns)
                        InkWell(
                          onTap: () {
                            setState(() {
                              _selectedConnection = conn;
                              _selectedSourceModuleId = module.id;
                            });
                          },
                          child: Container(
                            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                            decoration: BoxDecoration(
                              color: const Color(0xFFEFF6FF),
                              borderRadius: BorderRadius.circular(8),
                              border: Border.all(color: const Color(0xFFBFDBFE)),
                            ),
                            child: Row(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                const Icon(Icons.link_rounded, size: 12, color: Color(0xFF2563EB)),
                                const SizedBox(width: 4),
                                Text(
                                  conn.targetModuleId.toUpperCase(),
                                  style: const TextStyle(
                                    fontSize: 10,
                                    fontWeight: FontWeight.bold,
                                    color: Color(0xFF1D4ED8),
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ),
                    ],
                  ),
                  const SizedBox(height: 12),
                ],

                SizedBox(
                  width: double.infinity,
                  child: ElevatedButton.icon(
                    key: Key('open-${module.id}'),
                    onPressed: () => widget.onOpenModule(module),
                    icon: const Icon(Icons.open_in_new_rounded, size: 14),
                    label: const Text('Open App Screen', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: module.color,
                      foregroundColor: Colors.white,
                      padding: const EdgeInsets.symmetric(vertical: 10),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildAvailableJigsawPiece(SuiteModule module, {bool isDragging = false}) {
    return Container(
      width: 250,
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: isDragging ? module.color : const Color(0xFFE2E8F0), width: isDragging ? 2 : 1),
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
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        module.name,
                        style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 15),
                      ),
                      Text(
                        '${kes(module.monthlyPriceKes)}/mo',
                        style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: Color(0xFF059669)),
                      ),
                    ],
                  ),
                ),
                const Icon(Icons.drag_indicator_rounded, color: Color(0xFF94A3B8)),
              ],
            ),
            const SizedBox(height: 10),
            Text(
              module.description,
              style: TextStyle(fontSize: 12, color: Colors.grey.shade600),
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
            ),
            const SizedBox(height: 14),
            SizedBox(
              width: double.infinity,
              child: OutlinedButton.icon(
                key: Key('add-${module.id}'),
                onPressed: () => widget.onInstallModule(module.id),
                icon: const Icon(Icons.add_circle_outline_rounded, size: 14),
                label: const Text('Add to Workspace', style: TextStyle(fontSize: 12, fontWeight: FontWeight.bold)),
                style: OutlinedButton.styleFrom(
                  foregroundColor: module.color,
                  side: BorderSide(color: module.color.withValues(alpha: 0.6)),
                  padding: const EdgeInsets.symmetric(vertical: 8),
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
        const Row(
          children: [
            Icon(Icons.hub_rounded, size: 18, color: Color(0xFF3B82F6)),
            SizedBox(width: 8),
            Text(
              'Automated Inter-Module Data Flows (Live Fabric)',
              style: TextStyle(fontSize: 14, fontWeight: FontWeight.bold, color: Color(0xFF1E293B)),
            ),
          ],
        ),
        const SizedBox(height: 10),
        Wrap(
          spacing: 10,
          runSpacing: 10,
          children: [
            for (final mod in _installedModules)
              for (final dep in mod.dependencies)
                if (_installedIds.contains(dep.targetModuleId))
                  InkWell(
                    onTap: () {
                      setState(() {
                        _selectedConnection = dep;
                        _selectedSourceModuleId = mod.id;
                      });
                    },
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                      decoration: BoxDecoration(
                        color: Colors.white,
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(color: const Color(0xFFCBD5E1)),
                        boxShadow: [
                          BoxShadow(color: Colors.black.withValues(alpha: 0.02), blurRadius: 4)
                        ],
                      ),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Text(
                            mod.name,
                            style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 12),
                          ),
                          const Padding(
                            padding: EdgeInsets.symmetric(horizontal: 6),
                            child: Icon(Icons.sync_alt_rounded, size: 14, color: Color(0xFF3B82F6)),
                          ),
                          Text(
                            dep.targetModuleId.toUpperCase(),
                            style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 12, color: Color(0xFF1D4ED8)),
                          ),
                        ],
                      ),
                    ),
                  ),
          ],
        ),
      ],
    );
  }

  Widget _buildConnectionInspectorModal() {
    final srcModule = modules.firstWhere((m) => m.id == _selectedSourceModuleId, orElse: () => modules.first);
    final conn = _selectedConnection!;

    return Container(
      margin: const EdgeInsets.only(top: 20),
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: const Color(0xFFEFF6FF),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: const Color(0xFF93C5FD), width: 1.5),
      ),
      child: Row(
        children: [
          const Icon(Icons.info_outline_rounded, color: Color(0xFF1D4ED8), size: 28),
          const SizedBox(width: 16),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Data Connection: ${srcModule.name} ↔ ${conn.targetModuleId.toUpperCase()}',
                  style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 15, color: Color(0xFF1E3A8A)),
                ),
                const SizedBox(height: 4),
                Text(
                  conn.relationDescription,
                  style: const TextStyle(fontSize: 13, color: Color(0xFF1E40AF)),
                ),
              ],
            ),
          ),
          IconButton(
            icon: const Icon(Icons.close_rounded, color: Color(0xFF1E3A8A)),
            onPressed: () => setState(() => _selectedConnection = null),
          ),
        ],
      ),
    );
  }
}
