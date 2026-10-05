import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'suite.dart';
import 'workspace_modules.dart';
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
import 'modules/automation_studio.dart';
import 'modules/reseller_studio.dart';
import 'modules/smart_intake.dart';
import 'modules/executive_intelligence.dart';

class Dashboard extends StatefulWidget {
  final SuiteStore store;
  final String? initialModuleId;
  final String? workspaceName;
  final VoidCallback? onSwitchWorkspace;
  final bool isSuperAdmin;
  final bool canSeeReseller;

  const Dashboard({
    super.key,
    required this.store,
    this.initialModuleId,
    this.workspaceName,
    this.onSwitchWorkspace,
    this.isSuperAdmin = false,
    this.canSeeReseller = false,
  });

  @override
  State<Dashboard> createState() => _DashboardState();
}

class _DashboardState extends State<Dashboard> {
  String _activeTab = 'workspace';
  bool _showAiDrawer = false;
  String _billingQuery = '';

  SuiteStore get store => widget.store;

  @override
  void initState() {
    super.initState();
    store.addListener(_onStoreChanged);
    final moduleId = widget.initialModuleId;
    if (moduleId != null) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (!mounted) return;
        if (moduleId == 'reseller') {
          if (widget.canSeeReseller) _openResellerStudio();
          return;
        }
        if (moduleId == 'automation') {
          _openAutomationStudio();
          return;
        }
        final module = workspaceModuleById[moduleId];
        if (module != null) _navigateToModule(module);
      });
    }
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
      _openKnownModule('pos');
    } else if (action == 'create_customer') {
      _openKnownModule('crm');
    } else if (action == 'create_product') {
      _openKnownModule('inventory');
    } else if (action == 'create_invoice') {
      _openKnownModule('accounting');
    }
  }

  void _openKnownModule(String id) {
    final module = workspaceModuleById[id];
    if (module != null) _navigateToModule(module);
  }

  void _openAutomationStudio() {
    Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => AutomationStudio(
      store: store,
      onUpgrade: () {
        Navigator.of(context).pop();
        setState(() => _activeTab = 'billing');
      },
    )));
  }

  void _openSmartIntake() {
    Navigator.of(context).push(
      MaterialPageRoute<void>(builder: (_) => SmartIntakeScreen(store: store)),
    );
  }

  void _openResellerStudio() {
    if (!widget.canSeeReseller) return;
    Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => ResellerStudioScreen(store: store)));
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
        targetScreen = GenericEnterpriseModuleScreen(
          module: module,
          store: store,
        );
    }

    Navigator.push(context, MaterialPageRoute(builder: (_) => targetScreen));
  }

  Future<void> _installModule(String moduleId) async {
    try {
      final result = await store.call('installApp', {'appId': moduleId});
      if (!mounted) return;
      final installed =
          (result['installed'] as List?)?.cast<String>() ?? [moduleId];
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            installed.length > 1
                ? 'Added ${installed.join(', ')} including required dependencies.'
                : 'Added ${workspaceModuleById[moduleId]?.name ?? moduleId} to the workspace.',
          ),
          backgroundColor: const Color(0xFF10B981),
        ),
      );
    } catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Unable to add app: $error'),
          backgroundColor: Colors.red,
        ),
      );
    }
  }

  Future<void> _uninstallModule(String moduleId) async {
    try {
      await store.call('uninstallApp', {'appId': moduleId});
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            '${workspaceModuleById[moduleId]?.name ?? moduleId} removed from the workspace.',
          ),
        ),
      );
    } catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Unable to remove app: $error'),
          backgroundColor: Colors.red,
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final compact = MediaQuery.sizeOf(context).width < 760;
    return CallbackShortcuts(
      bindings: {
        const SingleActivator(LogicalKeyboardKey.keyK, control: true):
            _openCommandPalette,
        const SingleActivator(LogicalKeyboardKey.keyK, meta: true):
            _openCommandPalette,
      },
      child: Focus(
        autofocus: true,
        child: Scaffold(
          backgroundColor: const Color(0xFFF1F5F9),
          drawer: compact
              ? Drawer(child: SafeArea(child: _buildSidebar(compact: true)))
              : null,
          bottomNavigationBar: compact
              ? NavigationBar(
                  selectedIndex: switch (_activeTab) {
                    'billing' => 1,
                    'reports' => 2,
                    _ => 0,
                  },
                  onDestinationSelected: (index) => setState(() {
                    _activeTab = ['workspace', 'billing', 'reports'][index];
                  }),
                  destinations: const [
                    NavigationDestination(
                      icon: Icon(Icons.extension_rounded),
                      label: 'Workspace',
                    ),
                    NavigationDestination(
                      icon: Icon(Icons.credit_card_rounded),
                      label: 'Apps',
                    ),
                    NavigationDestination(
                      icon: Icon(Icons.insights_rounded),
                      label: 'Reports',
                    ),
                  ],
                )
              : null,
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
                  child: const Icon(
                    Icons.hub_rounded,
                    color: Colors.white,
                    size: 20,
                  ),
                ),
                const SizedBox(width: 10),
                Flexible(
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        compact ? 'TeknTandao' : 'TeknTandao Workspace',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          fontWeight: FontWeight.bold,
                          fontSize: 16,
                          color: Color(0xFF0F172A),
                        ),
                      ),
                      Text(
                        '${widget.workspaceName ?? 'Workspace'} · ${store.orgId}',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          fontSize: 10,
                          color: Color(0xFF64748B),
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
            actions: [
              IconButton(
                tooltip: 'Smart Intake · photo, document, text & IoT',
                onPressed: _openSmartIntake,
                icon: const Icon(Icons.document_scanner_outlined),
              ),
              IconButton(
                tooltip: 'Automation & custom features',
                onPressed: _openAutomationStudio,
                icon: const Icon(Icons.hub_outlined),
              ),
              if (widget.onSwitchWorkspace != null)
                IconButton(
                  tooltip: 'Switch workspace',
                  onPressed: widget.onSwitchWorkspace,
                  icon: const Icon(Icons.business_rounded),
                ),
              if (widget.canSeeReseller)
                IconButton(
                  tooltip: 'Reseller platform',
                  onPressed: _openResellerStudio,
                  icon: const Icon(Icons.storefront_outlined),
                ),
              if (compact) ...[
                IconButton(
                  tooltip: 'Search apps',
                  onPressed: _openCommandPalette,
                  icon: const Icon(Icons.search_rounded),
                ),
                IconButton(
                  tooltip: 'Ask AI Copilot',
                  onPressed: () =>
                      setState(() => _showAiDrawer = !_showAiDrawer),
                  icon: const Icon(Icons.auto_awesome_rounded),
                ),
                const SizedBox(width: 4),
              ] else ...[
                OutlinedButton.icon(
                  onPressed: _openCommandPalette,
                  icon: const Icon(Icons.search_rounded, size: 16),
                  label: const Text(
                    'Search apps · Cmd/Ctrl + K',
                    style: TextStyle(fontSize: 12),
                  ),
                ),
                const SizedBox(width: 12),
                ElevatedButton.icon(
                  onPressed: () =>
                      setState(() => _showAiDrawer = !_showAiDrawer),
                  icon: const Icon(Icons.auto_awesome_rounded, size: 16),
                  label: const Text('Ask AI Copilot'),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: const Color(0xFF4F46E5),
                    foregroundColor: Colors.white,
                  ),
                ),
                const SizedBox(width: 16),
              ],
            ],
          ),
          body: Stack(
            children: [
              Row(
                children: [
                  if (!compact) _buildSidebar(),
                  Expanded(
                    child: SingleChildScrollView(
                      padding: EdgeInsets.all(compact ? 12 : 24),
                      child: StreamBuilder<List<Map<String, dynamic>>>(
                        stream: store.watch('apps'),
                        builder: (context, snapshot) {
                          final installed = snapshot.data ?? [];
                          switch (_activeTab) {
                            case 'workspace':
                              return JigsawCanvas(
                                store: store,
                                installedApps: installed,
                                onInstallModule: _installModule,
                                onUninstallModule: _uninstallModule,
                                onOpenModule: _navigateToModule,
                              );
                            case 'billing':
                              return _buildBillingTab(installed);
                            case 'reports':
                              return _buildReportsTab();
                            default:
                              return const SizedBox.shrink();
                          }
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

  Widget _buildSidebar({bool compact = false}) {
    return Material(
      color: Colors.white,
      child: SizedBox(
        width: compact ? double.infinity : 240,
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 20, horizontal: 12),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              _navGroup('WORKSPACE CONTROL'),
              _navItem(
                'workspace',
                'Jigsaw Workspace',
                Icons.extension_rounded,
              ),
              _navItem(
                'billing',
                'Apps & Subscriptions',
                Icons.credit_card_rounded,
              ),
              _navItem(
                'reports',
                'Executive Analytics',
                Icons.insights_rounded,
              ),
              const SizedBox(height: 20),
              _navGroup('PROVISIONED APPS'),
              Expanded(
                child: StreamBuilder<List<Map<String, dynamic>>>(
                  stream: store.watch('apps'),
                  builder: (context, snapshot) {
                    final installed =
                        snapshot.data ?? const <Map<String, dynamic>>[];
                    final installedModules = installed
                        .map((app) => workspaceModuleById[app['id']])
                        .whereType<SuiteModule>()
                        .toList(growable: false);
                    if (installedModules.isEmpty) {
                      return const Padding(
                        padding: EdgeInsets.all(12),
                        child: Text(
                          'No apps installed yet.',
                          style: TextStyle(
                            fontSize: 12,
                            color: Color(0xFF94A3B8),
                          ),
                        ),
                      );
                    }
                    return ListView(
                      children: [
                        for (final module in installedModules)
                          Material(
                            color: Colors.transparent,
                            child: ListTile(
                              dense: true,
                              leading: Icon(
                                module.icon,
                                color: module.color,
                                size: 20,
                              ),
                              title: Text(
                                module.name,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: const TextStyle(
                                  fontWeight: FontWeight.w600,
                                  fontSize: 13,
                                ),
                              ),
                              onTap: () => _navigateToModule(module),
                            ),
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
                child: const Text(
                  'Africa-first integrations are enabled only when their real provider configuration is complete.',
                  style: TextStyle(fontSize: 11, color: Color(0xFF64748B)),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _navGroup(String title) => Padding(
    padding: const EdgeInsets.only(left: 12, bottom: 8),
    child: Text(
      title,
      style: const TextStyle(
        fontSize: 10,
        fontWeight: FontWeight.bold,
        color: Color(0xFF94A3B8),
        letterSpacing: 0.8,
      ),
    ),
  );

  Widget _navItem(String id, String label, IconData icon) {
    final selected = _activeTab == id;
    return Padding(
      padding: const EdgeInsets.only(bottom: 4),
      child: Material(
        color: selected ? const Color(0xFFEFF6FF) : Colors.transparent,
        borderRadius: BorderRadius.circular(10),
        clipBehavior: Clip.antiAlias,
        child: ListTile(
          dense: true,
          leading: Icon(
            icon,
            color: selected ? const Color(0xFF2563EB) : const Color(0xFF64748B),
            size: 20,
          ),
          title: Text(
            label,
            style: TextStyle(
              fontWeight: selected ? FontWeight.bold : FontWeight.w500,
              color: selected
                  ? const Color(0xFF1D4ED8)
                  : const Color(0xFF334155),
              fontSize: 13,
            ),
          ),
          onTap: () {
            setState(() => _activeTab = id);
            if (MediaQuery.sizeOf(context).width < 760) {
              Navigator.of(context).maybePop();
            }
          },
        ),
      ),
    );
  }

  Widget _buildBillingTab(List<Map<String, dynamic>> installed) {
    final query = _billingQuery.trim().toLowerCase();
    final matches = workspaceModules
        .where((module) {
          if (query.isEmpty) return true;
          return '${module.name} ${module.category} ${module.description}'
              .toLowerCase()
              .contains(query);
        })
        .toList(growable: false);
    final visible = query.isEmpty
        ? matches.take(80).toList(growable: false)
        : matches;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text(
          'Modular Subscription Engine',
          style: TextStyle(fontSize: 22, fontWeight: FontWeight.bold),
        ),
        const SizedBox(height: 4),
        const Text(
          'Every app has its own monthly price. Bundle discounts apply automatically: 10% for 3–5 apps and 20% for 6+.',
          style: TextStyle(color: Color(0xFF64748B)),
        ),
        const SizedBox(height: 18),
        TextField(
          decoration: const InputDecoration(
            prefixIcon: Icon(Icons.search_rounded),
            hintText: 'Search subscriptions by app or category...',
            border: OutlineInputBorder(),
          ),
          onChanged: (value) => setState(() => _billingQuery = value),
        ),
        const SizedBox(height: 16),
        Card(
          child: ListView.separated(
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            itemCount: visible.length,
            separatorBuilder: (_, _) => const Divider(height: 1),
            itemBuilder: (context, index) {
              final module = visible[index];
              final isInstalled = installed.any(
                (app) => app['id'] == module.id,
              );
              return ListTile(
                leading: Icon(module.icon, color: module.color),
                title: Text(
                  module.name,
                  style: const TextStyle(fontWeight: FontWeight.bold),
                ),
                subtitle: Text(module.category),
                trailing: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      '${kes(module.monthlyPriceKes)}/mo',
                      style: const TextStyle(fontWeight: FontWeight.bold),
                    ),
                    const SizedBox(width: 14),
                    Switch(
                      value: isInstalled,
                      onChanged: (value) => value
                          ? _installModule(module.id)
                          : _uninstallModule(module.id),
                    ),
                  ],
                ),
              );
            },
          ),
        ),
        if (visible.length < matches.length) ...[
          const SizedBox(height: 10),
          Text(
            'Showing ${visible.length} of ${matches.length}. Search to locate any app in the full catalogue.',
            style: const TextStyle(fontSize: 12, color: Color(0xFF64748B)),
          ),
        ],
      ],
    );
  }

  Widget _buildReportsTab() =>
      ExecutiveIntelligencePanel(store: store);
}
