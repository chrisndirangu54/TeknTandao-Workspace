import 'package:flutter/material.dart';
import '../suite.dart';

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
  Widget build(BuildContext context) {
    return Dialog(
      backgroundColor: Colors.transparent,
      insetPadding: const EdgeInsets.symmetric(horizontal: 20, vertical: 40),
      child: Container(
        width: 600,
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
            // Search Input Header
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
                      decoration: const InputDecoration(
                        hintText: 'Type a command or search customers, products, invoices... (Esc to close)',
                        border: InputBorder.none,
                      ),
                      onChanged: (val) => setState(() => _searchQuery = val.trim().toLowerCase()),
                    ),
                  ),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                    decoration: BoxDecoration(
                      color: const Color(0xFFF1F5F9),
                      borderRadius: BorderRadius.circular(6),
                      border: Border.all(color: const Color(0xFFCBD5E1)),
                    ),
                    child: const Text(
                      'ESC',
                      style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold, color: Color(0xFF64748B)),
                    ),
                  ),
                ],
              ),
            ),

            const Divider(height: 1),

            // Command Results List
            SizedBox(
              height: 380,
              child: SingleChildScrollView(
                padding: const EdgeInsets.symmetric(vertical: 8),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    if (_searchQuery.isEmpty) ...[
                      _buildSectionHeader('Universal Quick Create Actions'),
                      _buildActionItem(
                        icon: Icons.person_add_rounded,
                        color: const Color(0xFF3B82F6),
                        title: 'Create New Customer / Lead',
                        subtitle: 'Add a customer to CRM & share with POS and Accounting',
                        onTap: () {
                          Navigator.pop(context);
                          widget.onExecuteAction('create_customer', null);
                        },
                      ),
                      _buildActionItem(
                        icon: Icons.receipt_rounded,
                        color: const Color(0xFF8B5CF6),
                        title: 'Issue New Tax Invoice',
                        subtitle: 'Generate invoice & submit to KRA eTIMS queue',
                        onTap: () {
                          Navigator.pop(context);
                          widget.onExecuteAction('create_invoice', null);
                        },
                      ),
                      _buildActionItem(
                        icon: Icons.inventory_2_rounded,
                        color: const Color(0xFFF59E0B),
                        title: 'Register New Product / Stock SKU',
                        subtitle: 'Add product with barcode, price & warehouse stock',
                        onTap: () {
                          Navigator.pop(context);
                          widget.onExecuteAction('create_product', null);
                        },
                      ),
                      _buildActionItem(
                        icon: Icons.point_of_sale_rounded,
                        color: const Color(0xFF10B981),
                        title: 'Record POS Retail Sale',
                        subtitle: 'Process cash or M-Pesa sale at terminal',
                        onTap: () {
                          Navigator.pop(context);
                          widget.onExecuteAction('record_sale', null);
                        },
                      ),
                      _buildSectionHeader('Ask AI Copilot'),
                      _buildActionItem(
                        icon: Icons.auto_awesome_rounded,
                        color: const Color(0xFFEC4899),
                        title: 'Ask AI Copilot Question',
                        subtitle: 'Query cash flow, inventory forecasts, or revenue analytics',
                        onTap: () {
                          Navigator.pop(context);
                          widget.onExecuteAction('open_ai', null);
                        },
                      ),
                    ] else ...[
                      // Filtered Command Search
                      _buildSectionHeader('Navigation & System Commands'),
                      for (final mod in modules.where((m) => m.name.toLowerCase().contains(_searchQuery) || m.description.toLowerCase().contains(_searchQuery)))
                        _buildActionItem(
                          icon: mod.icon,
                          color: mod.color,
                          title: 'Open ${mod.name} Module',
                          subtitle: mod.description,
                          onTap: () {
                            Navigator.pop(context);
                            widget.onExecuteAction('open_module', mod);
                          },
                        ),
                    ],
                  ],
                ),
              ),
            ),

            const Divider(height: 1),

            // Footer Shortcut Hints
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
              child: Row(
                children: [
                  Text('Press ', style: TextStyle(fontSize: 12, color: Colors.grey.shade600)),
                  const Text('Ctrl/Cmd + K ', style: TextStyle(fontSize: 12, fontWeight: FontWeight.bold)),
                  Text('anywhere to summon this command palette', style: TextStyle(fontSize: 12, color: Colors.grey.shade600)),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildSectionHeader(String title) {
    return Padding(
      padding: const EdgeInsets.only(left: 16, top: 12, bottom: 6),
      child: Text(
        title.toUpperCase(),
        style: const TextStyle(fontSize: 11, fontWeight: FontWeight.bold, color: Color(0xFF94A3B8), letterSpacing: 0.8),
      ),
    );
  }

  Widget _buildActionItem({
    required IconData icon,
    required Color color,
    required String title,
    required String subtitle,
    required VoidCallback onTap,
  }) {
    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
        child: Row(
          children: [
            Container(
              padding: const EdgeInsets.all(8),
              decoration: BoxDecoration(
                color: color.withValues(alpha: 0.12),
                borderRadius: BorderRadius.circular(10),
              ),
              child: Icon(icon, color: color, size: 20),
            ),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: Color(0xFF1E293B)),
                  ),
                  Text(
                    subtitle,
                    style: const TextStyle(fontSize: 12, color: Color(0xFF64748B)),
                  ),
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
