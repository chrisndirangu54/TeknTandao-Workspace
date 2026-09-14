import 'package:flutter/material.dart';
import '../suite.dart';
import '../workspace_modules.dart';

class CommandPaletteDialog extends StatefulWidget {
  final SuiteStore store;
  final Function(String action, dynamic data) onExecuteAction;

  const CommandPaletteDialog({
    super.key,
    required this.store,
    required this.onExecuteAction,
  });

  @override
  State<CommandPaletteDialog> createState() => _CommandPaletteDialogState();
}

class _CommandPaletteDialogState extends State<CommandPaletteDialog> {
  final TextEditingController _queryController = TextEditingController();
  String _searchQuery = '';

  @override
  void dispose() {
    _queryController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final matches = _searchQuery.isEmpty
        ? const <SuiteModule>[]
        : workspaceModules
            .where((module) {
              final haystack = '${module.name} ${module.description} ${module.category}'.toLowerCase();
              return haystack.contains(_searchQuery);
            })
            .take(60)
            .toList(growable: false);

    return Dialog(
      backgroundColor: Colors.transparent,
      insetPadding: const EdgeInsets.symmetric(horizontal: 20, vertical: 40),
      child: Container(
        width: 660,
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(20),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withValues(alpha: 0.25),
              blurRadius: 30,
              offset: const Offset(0, 10),
            ),
          ],
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Padding(
              padding: const EdgeInsets.all(16),
              child: Row(
                children: [
                  const Icon(Icons.search_rounded, color: Color(0xFF3B82F6), size: 24),
                  const SizedBox(width: 12),
                  Expanded(
                    child: TextField(
                      controller: _queryController,
                      autofocus: true,
                      style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w500),
                      decoration: InputDecoration(
                        hintText: 'Search ${workspaceModules.length} apps or type a command...',
                        border: InputBorder.none,
                      ),
                      onChanged: (value) => setState(() => _searchQuery = value.trim().toLowerCase()),
                    ),
                  ),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                    decoration: BoxDecoration(
                      color: const Color(0xFFF1F5F9),
                      borderRadius: BorderRadius.circular(6),
                      border: Border.all(color: const Color(0xFFCBD5E1)),
                    ),
                    child: const Text('ESC', style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold, color: Color(0xFF64748B))),
                  ),
                ],
              ),
            ),
            const Divider(height: 1),
            SizedBox(
              height: 420,
              child: SingleChildScrollView(
                padding: const EdgeInsets.symmetric(vertical: 8),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    if (_searchQuery.isEmpty) ...[
                      _section('Universal Quick Create Actions'),
                      _action(Icons.person_add_rounded, const Color(0xFF3B82F6), 'Create New Customer / Lead', 'Add a customer to CRM & share with POS and Accounting', () => _run('create_customer')),
                      _action(Icons.receipt_rounded, const Color(0xFF8B5CF6), 'Issue New Tax Invoice', 'Open Accounting invoice workflow', () => _run('create_invoice')),
                      _action(Icons.inventory_2_rounded, const Color(0xFFF59E0B), 'Register Product / Stock SKU', 'Open Inventory product workflow', () => _run('create_product')),
                      _action(Icons.point_of_sale_rounded, const Color(0xFF10B981), 'Record POS Retail Sale', 'Open the POS transaction workflow', () => _run('record_sale')),
                      _section('AI'),
                      _action(Icons.auto_awesome_rounded, const Color(0xFFEC4899), 'Ask AI Copilot', 'Query bounded cross-module business facts', () => _run('open_ai')),
                      Padding(
                        padding: const EdgeInsets.fromLTRB(16, 18, 16, 6),
                        child: Text(
                          '${workspaceModules.length} individually installable apps are available. Start typing to search the full master catalogue.',
                          style: const TextStyle(fontSize: 12, color: Color(0xFF64748B)),
                        ),
                      ),
                    ] else ...[
                      _section('Apps'),
                      if (matches.isEmpty)
                        const Padding(
                          padding: EdgeInsets.all(20),
                          child: Text('No matching application found.', style: TextStyle(color: Color(0xFF64748B))),
                        ),
                      for (final module in matches)
                        _action(
                          module.icon,
                          module.color,
                          module.name,
                          '${module.category} · ${module.description}',
                          () {
                            Navigator.pop(context);
                            widget.onExecuteAction('open_module', module);
                          },
                        ),
                      if (matches.length == 60)
                        const Padding(
                          padding: EdgeInsets.all(16),
                          child: Text('Showing the first 60 matches. Refine the search to narrow the catalogue.', style: TextStyle(fontSize: 12, color: Color(0xFF64748B))),
                        ),
                    ],
                  ],
                ),
              ),
            ),
            const Divider(height: 1),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
              child: Row(
                children: [
                  Text('Press ', style: TextStyle(fontSize: 12, color: Colors.grey.shade600)),
                  const Text('Ctrl/Cmd + K ', style: TextStyle(fontSize: 12, fontWeight: FontWeight.bold)),
                  Text('anywhere to search apps and actions', style: TextStyle(fontSize: 12, color: Colors.grey.shade600)),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  void _run(String action) {
    Navigator.pop(context);
    widget.onExecuteAction(action, null);
  }

  Widget _section(String title) => Padding(
        padding: const EdgeInsets.only(left: 16, top: 12, bottom: 6),
        child: Text(title.toUpperCase(), style: const TextStyle(fontSize: 11, fontWeight: FontWeight.bold, color: Color(0xFF94A3B8), letterSpacing: 0.8)),
      );

  Widget _action(IconData icon, Color color, String title, String subtitle, VoidCallback onTap) {
    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
        child: Row(
          children: [
            Container(
              padding: const EdgeInsets.all(8),
              decoration: BoxDecoration(color: color.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(10)),
              child: Icon(icon, color: color, size: 20),
            ),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(title, style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: Color(0xFF1E293B))),
                  Text(subtitle, maxLines: 2, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 12, color: Color(0xFF64748B))),
                ],
              ),
            ),
            const Icon(Icons.chevron_right_rounded, color: Color(0xFFCBD5E1), size: 20),
          ],
        ),
      ),
    );
  }
}
