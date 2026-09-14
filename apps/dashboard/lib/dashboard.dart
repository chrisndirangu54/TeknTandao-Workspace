import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'suite.dart';
import 'widgets/jigsaw_canvas.dart';
import 'widgets/command_palette.dart';
import 'widgets/ai_copilot.dart';
import 'modules/pos_module.dart';
import 'modules/crm_module.dart';
import 'modules/inventory_module.dart';
import 'modules/accounting_module.dart';
import 'modules/hr_module.dart';
import 'modules/projects_module.dart';
import 'modules/helpdesk_module.dart';
import 'modules/hospital_module.dart';
import 'modules/school_module.dart';
import 'modules/property_module.dart';
import 'modules/sacco_module.dart';
import 'modules/etims_module.dart';
import 'modules/payments_module.dart';
import 'modules/marketing_module.dart';
import 'modules/bookings_module.dart';
import 'modules/ecommerce_module.dart';
import 'modules/procurement_module.dart';
import 'modules/manufacturing_module.dart';
import 'modules/fieldservice_module.dart';
import 'modules/fleet_module.dart';
import 'modules/hotel_module.dart';
import 'modules/restaurant_module.dart';
import 'modules/ngo_module.dart';
import 'modules/documents_module.dart';
import 'modules/generic_module_screen.dart';

class Dashboard extends StatefulWidget {
  final SuiteStore store;
  const Dashboard({super.key, required this.store});

  @override
  State<Dashboard> createState() => _DashboardState();
}

class _DashboardState extends State<Dashboard> {
  String _activeTab = 'workspace';
  bool _showAiDrawer = false;

  SuiteStore get store => widget.store;

  @override
  void initState() {
    super.initState();
    store.addListener(_onStoreChanged);
  }

  @override
  void dispose() {
    store.removeListener(_onStoreChanged);
    super.dispose();
  }

  void _onStoreChanged() {
    if (mounted) setState(() {});
  }

  void _openCommandPalette() {
    showDialog(
      context: context,
      builder: (context) => CommandPaletteDialog(
        store: store,
        onExecuteAction: _handleCommandAction,
      ),
    );
  }

  void _handleCommandAction(String action, dynamic data) {
    if (action == 'open_ai') {
      setState(() => _showAiDrawer = true);
    } else if (action == 'open_module' && data is SuiteModule) {
      _navigateToModule(data);
    } else if (action == 'record_sale') {
      _navigateToModule(modules.firstWhere((m) => m.id == 'pos'));
    } else if (action == 'create_customer') {
      _navigateToModule(modules.firstWhere((m) => m.id == 'crm'));
    } else if (action == 'create_product') {
      _navigateToModule(modules.firstWhere((m) => m.id == 'inventory'));
    } else if (action == 'create_invoice') {
      _navigateToModule(modules.firstWhere((m) => m.id == 'accounting'));
    }
  }

  void _navigateToModule(SuiteModule module) {
    Widget targetScreen;
    switch (module.id) {
      case 'pos':
        targetScreen = PosModuleScreen(store: store);
        break;
      case 'crm':
        targetScreen = CrmModuleScreen(store: store);
        break;
      case 'inventory':
        targetScreen = InventoryModuleScreen(store: store);
        break;
      case 'accounting':
        targetScreen = AccountingModuleScreen(store: store);
        break;
      case 'hr':
        targetScreen = HrModuleScreen(store: store);
        break;
      case 'projects':
        targetScreen = ProjectsModuleScreen(store: store);
        break;
      case 'helpdesk':
        targetScreen = HelpdeskModuleScreen(store: store);
        break;
      case 'hospital':
        targetScreen = HospitalModuleScreen(store: store);
        break;
      case 'school':
        targetScreen = SchoolModuleScreen(store: store);
        break;
      case 'property':
        targetScreen = PropertyModuleScreen(store: store);
        break;
      case 'sacco':
        targetScreen = SaccoModuleScreen(store: store);
        break;
      case 'etims':
        targetScreen = EtimsModuleScreen(store: store);
        break;
      case 'payments':
        targetScreen = PaymentsModuleScreen(store: store);
        break;
      case 'marketing':
        targetScreen = MarketingModuleScreen(store: store);
        break;
      case 'bookings':
        targetScreen = BookingsModuleScreen(store: store);
        break;
      case 'ecommerce':
        targetScreen = EcommerceModuleScreen(store: store);
        break;
      case 'procurement':
        targetScreen = ProcurementModuleScreen(store: store);
        break;
      case 'manufacturing':
        targetScreen = ManufacturingModuleScreen(store: store);
        break;
      case 'fieldservice':
        targetScreen = FieldServiceModuleScreen(store: store);
        break;
      case 'fleet':
        targetScreen = FleetModuleScreen(store: store);
        break;
      case 'hotel':
        targetScreen = HotelModuleScreen(store: store);
        break;
      case 'restaurant':
        targetScreen = RestaurantModuleScreen(store: store);
        break;
      case 'ngo':
        targetScreen = NgoModuleScreen(store: store);
        break;
      case 'documents':
        targetScreen = DocumentsModuleScreen(store: store);
        break;
      default:
        targetScreen = GenericEnterpriseModuleScreen(module: module, store: store);
    }

    Navigator.push(
      context,
      MaterialPageRoute(builder: (_) => targetScreen),
    );
  }

  Future<void> _installModule(String moduleId) async {
    await store.call('installApp', {'appId': moduleId});
    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('⚡ Module "$moduleId" snapped into puzzle workspace & data connections provisioned!'),
          backgroundColor: const Color(0xFF10B981),
        ),
      );
    }
  }

  Future<void> _uninstallModule(String moduleId) async {
    await store.call('uninstallApp', {'appId': moduleId});
    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Module "$moduleId" removed from active workspace.')),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return CallbackShortcuts(
      bindings: {
        const SingleActivator(LogicalKeyboardKey.keyK, control: true): _openCommandPalette,
        const SingleActivator(LogicalKeyboardKey.keyK, meta: true): _openCommandPalette,
      },
      child: Focus(
        autofocus: true,
        child: Scaffold(
          backgroundColor: const Color(0xFFF1F5F9),
          appBar: AppBar(
            backgroundColor: Colors.white,
            elevation: 0.5,
            title: Row(
              children: [
                Container(
                  padding: const EdgeInsets.all(6),
                  decoration: BoxDecoration(
                    color: const Color(0xFF3B82F6),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: const Icon(Icons.hub_rounded, color: Colors.white, size: 20),
                ),
                const SizedBox(width: 10),
                const Text(
                  'African Business OS',
                  style: TextStyle(fontWeight: FontWeight.bold, fontSize: 18, color: Color(0xFF0F172A)),
                ),
                const SizedBox(width: 12),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                  decoration: BoxDecoration(
                    color: const Color(0xFFEFF6FF),
                    borderRadius: BorderRadius.circular(6),
                  ),
                  child: const Text(
                    'TeknTandao Enterprise',
                    style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold, color: Color(0xFF2563EB)),
                  ),
                ),
              ],
            ),
            actions: [
              OutlinedButton.icon(
                onPressed: _openCommandPalette,
                icon: const Icon(Icons.search_rounded, size: 16),
                label: const Text('Search or Cmd + K', style: TextStyle(fontSize: 12)),
                style: OutlinedButton.styleFrom(
                  foregroundColor: const Color(0xFF475569),
                  side: const BorderSide(color: Color(0xFFCBD5E1)),
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                ),
              ),
              const SizedBox(width: 12),
              ElevatedButton.icon(
                onPressed: () => setState(() => _showAiDrawer = !_showAiDrawer),
                icon: const Icon(Icons.auto_awesome_rounded, size: 16),
                label: const Text('Ask AI Copilot'),
                style: ElevatedButton.styleFrom(
                  backgroundColor: const Color(0xFF4F46E5),
                  foregroundColor: Colors.white,
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                ),
              ),
              const SizedBox(width: 16),
            ],
          ),
          body: Stack(
            children: [
              Row(
                children: [
                  Container(
                    width: 240,
                    color: Colors.white,
                    padding: const EdgeInsets.symmetric(vertical: 20, horizontal: 12),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        _buildNavGroupTitle('WORKSPACE CONTROL'),
                        _buildNavItem('workspace', 'Jigsaw Workspace', Icons.extension_rounded),
                        _buildNavItem('billing', 'Subscriptions & KES', Icons.credit_card_rounded),
                        _buildNavItem('reports', 'Executive Analytics', Icons.insights_rounded),
                        const SizedBox(height: 20),
                        _buildNavGroupTitle('PROVISIONED MODULES'),
                        Expanded(
                          child: StreamBuilder<List<Map<String, dynamic>>>(
                            stream: store.watch('apps'),
                            builder: (context, snapshot) {
                              final installed = snapshot.data ?? [];
                              return ListView(
                                children: [
                                  for (final app in installed)
                                    for (final m in modules)
                                      if (m.id == app['id'])
                                        ListTile(
                                          dense: true,
                                          leading: Icon(m.icon, color: m.color, size: 20),
                                          title: Text(m.name, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13)),
                                          onTap: () => _navigateToModule(m),
                                        ),
                                ],
                              );
                            },
                          ),
                        ),
                        Container(
                          padding: const EdgeInsets.all(12),
                          decoration: BoxDecoration(
                            color: const Color(0xFFF8FAFC),
                            borderRadius: BorderRadius.circular(12),
                            border: Border.all(color: const Color(0xFFE2E8F0)),
                          ),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              const Text('KRA eTIMS & M-Pesa', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 12)),
                              const SizedBox(height: 4),
                              Text('PIN: P051928471Z · Active', style: TextStyle(fontSize: 11, color: Colors.grey.shade600)),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),
                  Expanded(
                    child: SingleChildScrollView(
                      padding: const EdgeInsets.all(24),
                      child: StreamBuilder<List<Map<String, dynamic>>>(
                        stream: store.watch('apps'),
                        builder: (context, snapshot) {
                          final installed = snapshot.data ?? [];
                          if (_activeTab == 'workspace') {
                            return JigsawCanvas(
                              store: store,
                              installedApps: installed,
                              onInstallModule: _installModule,
                              onUninstallModule: _uninstallModule,
                              onOpenModule: _navigateToModule,
                            );
                          } else if (_activeTab == 'billing') {
                            return _buildBillingTab(installed);
                          } else if (_activeTab == 'reports') {
                            return _buildReportsTab();
                          }
                          return Container();
                        },
                      ),
                    ),
                  ),
                ],
              ),
              if (_showAiDrawer)
                Positioned(
                  top: 0,
                  bottom: 0,
                  right: 0,
                  child: AiCopilotDrawer(
                    store: store,
                    onClose: () => setState(() => _showAiDrawer = false),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildNavGroupTitle(String title) {
    return Padding(
      padding: const EdgeInsets.only(left: 12, bottom: 8),
      child: Text(
        title,
        style: const TextStyle(fontSize: 10, fontWeight: FontWeight.bold, color: Color(0xFF94A3B8), letterSpacing: 0.8),
      ),
    );
  }

  Widget _buildNavItem(String id, String label, IconData icon) {
    final selected = _activeTab == id;
    return Container(
      margin: const EdgeInsets.only(bottom: 4),
      decoration: BoxDecoration(
        color: selected ? const Color(0xFFEFF6FF) : Colors.transparent,
        borderRadius: BorderRadius.circular(10),
      ),
      child: ListTile(
        dense: true,
        leading: Icon(icon, color: selected ? const Color(0xFF2563EB) : const Color(0xFF64748B), size: 20),
        title: Text(
          label,
          style: TextStyle(
            fontWeight: selected ? FontWeight.bold : FontWeight.w500,
            color: selected ? const Color(0xFF1D4ED8) : const Color(0xFF334155),
            fontSize: 13,
          ),
        ),
        onTap: () => setState(() => _activeTab = id),
      ),
    );
  }

  Widget _buildBillingTab(List<Map<String, dynamic>> installed) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text('Modular Subscription Engine', style: TextStyle(fontSize: 22, fontWeight: FontWeight.bold)),
        const Text('Pay per module · Bundle discounts applied automatically (10% off for 3+, 20% off for 6+)', style: TextStyle(color: Color(0xFF64748B))),
        const SizedBox(height: 20),
        Card(
          child: ListView.separated(
            shrinkWrap: true,
            itemCount: modules.length,
            separatorBuilder: (context, index) => const Divider(height: 1),
            itemBuilder: (context, idx) {
              final m = modules[idx];
              final isInstalled = installed.any((a) => a['id'] == m.id);
              return ListTile(
                leading: Icon(m.icon, color: m.color),
                title: Text(m.name, style: const TextStyle(fontWeight: FontWeight.bold)),
                subtitle: Text(m.description),
                trailing: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text('${kes(m.monthlyPriceKes)}/mo', style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 14)),
                    const SizedBox(width: 16),
                    Switch(
                      value: isInstalled,
                      onChanged: (val) => val ? _installModule(m.id) : _uninstallModule(m.id),
                    ),
                  ],
                ),
              );
            },
          ),
        ),
      ],
    );
  }

  Widget _buildReportsTab() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text('Executive Cross-Module Analytics', style: TextStyle(fontSize: 22, fontWeight: FontWeight.bold)),
        const Text('Real-time consolidated operational metrics across POS, Invoices, CRM and Inventory', style: TextStyle(color: Color(0xFF64748B))),
        const SizedBox(height: 20),
        FutureBuilder<Map<String, dynamic>>(
          future: store.call('generateReport', {'useAi': false}),
          builder: (context, snapshot) {
            if (!snapshot.hasData) return const CircularProgressIndicator();
            return Card(
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Text(
                  snapshot.data!['narrative'] ?? '',
                  style: const TextStyle(fontSize: 16, height: 1.6),
                ),
              ),
            );
          },
        ),
      ],
    );
  }
}
